/**
 * VK Meow Crypt - Crypto Module
 * Handles all E2EE encryption, key exchange, and secure messaging
 */

const Crypto = (function() {
    'use strict';

    // Tags for message types
    const TAGS = {
        KEY_REQ: '[MEOW_KEY_REQ]',
        KEY_RES: '[MEOW_KEY_RES]',
        E2E: '[MEOW_E2E]',
        PLAIN: '[MEOW]'
    };

    // E2EE key states per peer
    const keyStates = {};

    // Decryption cache
    const decryptedCache = new Map();

    // File decryption cache (session only)
    const fileCache = new Map();

    // Safe storage wrapper
    const storage = {
        get(key) {
            try { return localStorage.getItem(key); } catch(e) { return null; }
        },
        set(key, val) {
            try { localStorage.setItem(key, val); } catch(e) {}
        },
        remove(key) {
            try { localStorage.removeItem(key); } catch(e) {}
        }
    };

    // ===== Base64 Utilities =====
    function bytesToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function concatBytes(...arrays) {
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    // ===== HTML Escape =====
    function unescapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }

    // ===== Key Pair Management =====
    async function ensureKeyPair() {
        const pub = storage.get('ec_pub');
        const priv = storage.get('ec_priv');
        if (pub && priv) return;

        try {
            const keyPair = await window.crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'P-256' },
                true,
                ['deriveBits']
            );
            const pubBuf = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
            const privBuf = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

            storage.set('ec_pub', bytesToBase64(pubBuf));
            storage.set('ec_priv', bytesToBase64(privBuf));
        } catch (e) {
            console.error('Failed to generate ECDH key pair:', e);
            throw e;
        }
    }

    async function deriveSharedKey(peerId) {
        try {
            const peerPubB64 = storage.get('peer_pub_' + peerId);
            const ownPrivB64 = storage.get('ec_priv');

            if (!peerPubB64 || !ownPrivB64) return null;

            const ownPrivKey = await window.crypto.subtle.importKey(
                'pkcs8',
                base64ToBytes(ownPrivB64),
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                ['deriveBits']
            );

            const peerPubKey = await window.crypto.subtle.importKey(
                'spki',
                base64ToBytes(peerPubB64),
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            );

            const sharedBits = await window.crypto.subtle.deriveBits(
                { name: 'ECDH', public: peerPubKey },
                ownPrivKey,
                256
            );

            const hash = await window.crypto.subtle.digest('SHA-256', sharedBits);

            return await window.crypto.subtle.importKey(
                'raw',
                hash,
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (e) {
            console.error('Failed to derive shared key for peer', peerId, ':', e);
            return null;
        }
    }

    // ===== Key Exchange =====
    async function sendPublicKey(peerId, force = false) {
        const peerPub = storage.get('peer_pub_' + peerId);
        if (peerPub && !force) return false;

        await ensureKeyPair();
        const ownPub = storage.get('ec_pub');
        if (!ownPub) return false;

        // Update state to "requesting"
        keyStates[peerId] = 'requesting';

        return TAGS.KEY_REQ + ownPub;
    }

    async function handleKeyExchange(text, peerId) {
        const s = unescapeHtml(text);

        if (s.startsWith(TAGS.KEY_REQ)) {
            const pub = s.substring(TAGS.KEY_REQ.length);
            storage.set('peer_pub_' + peerId, pub);

            await ensureKeyPair();
            const ownPub = storage.get('ec_pub');
            if (ownPub) {
                // Send response
                keyStates[peerId] = 'responding';
                return TAGS.KEY_RES + ownPub;
            }
        } else if (s.startsWith(TAGS.KEY_RES)) {
            const pub = s.substring(TAGS.KEY_RES.length);
            storage.set('peer_pub_' + peerId, pub);
            keyStates[peerId] = 'established';
            return null;
        }

        return null;
    }

    // ===== Text Encryption =====
    async function encryptText(text, peerId) {
        if (!text) return '';

        const e2eKey = await deriveSharedKey(peerId);
        if (!e2eKey) {
            throw new Error('E2EE_NOT_ESTABLISHED');
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            e2eKey,
            new TextEncoder().encode(text)
        );

        return TAGS.E2E + bytesToBase64(concatBytes(iv, new Uint8Array(ciphertext)));
    }

    async function decryptText(encryptedText, peerId) {
        if (!encryptedText) return '';

        const s = unescapeHtml(encryptedText);

        // Check cache
        if (decryptedCache.has(s)) {
            return decryptedCache.get(s);
        }

        let result = encryptedText;

        try {
            if (s.startsWith(TAGS.KEY_REQ)) {
                result = '🔐 [E2EE: Запрос ключа]';
            } else if (s.startsWith(TAGS.KEY_RES)) {
                result = '🔐 [E2EE: Ключ получен]';
                keyStates[peerId] = 'established';
            } else if (s.startsWith(TAGS.E2E)) {
                const b64 = s.substring(TAGS.E2E.length);
                const data = base64ToBytes(b64);

                if (data.length < 12) {
                    result = '[Ошибка: неверные данные]';
                } else {
                    const iv = data.slice(0, 12);
                    const cipher = data.slice(12);
                    const sharedKey = await deriveSharedKey(peerId);

                    if (!sharedKey) {
                        result = '🔒 [Ожидание E2EE обмена...]';
                    } else {
                        const dec = await window.crypto.subtle.decrypt(
                            { name: 'AES-GCM', iv: iv },
                            sharedKey,
                            cipher
                        );
                        result = new TextDecoder().decode(dec);
                    }
                }
            } else if (s.startsWith(TAGS.PLAIN)) {
                // Legacy fallback - try to decrypt with old method
                // This is for backward compatibility only
                result = '[Устаревшее шифрование]';
            }
        } catch (e) {
            console.error('Decryption error:', e);
            result = '❌ [Ошибка расшифровки]';
        }

        decryptedCache.set(s, result);
        return result;
    }

    // ===== Binary Encryption =====
    async function encryptBinary(arrayBuffer, peerId) {
        const e2eKey = await deriveSharedKey(peerId);
        if (!e2eKey) {
            throw new Error('E2EE_NOT_ESTABLISHED');
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            e2eKey,
            arrayBuffer
        );

        return concatBytes(iv, new Uint8Array(ciphertext)).buffer;
    }

    async function decryptBinary(arrayBuffer, peerId) {
        try {
            const enc = new Uint8Array(arrayBuffer);
            if (enc.length < 12) return null;

            const sharedKey = await deriveSharedKey(peerId);
            if (!sharedKey) return null;

            const iv = enc.slice(0, 12);
            const cipher = enc.slice(12);

            return await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                sharedKey,
                cipher
            );
        } catch (e) {
            console.error('Binary decryption error:', e);
            return null;
        }
    }

    // ===== File Utilities =====
    async function fetchBinary(url) {
        const proxies = [
            url,
            'https://corsproxy.io/?' + encodeURIComponent(url),
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
        ];

        for (const target of proxies) {
            try {
                const res = await fetch(target, { 
                    method: 'GET',
                    headers: { 'Accept': '*/*' }
                });
                if (res.ok) {
                    return await res.arrayBuffer();
                }
            } catch (e) {
                console.warn('Proxy failed:', target.substring(0, 50));
            }
        }

        throw new Error('Failed to fetch binary data from all proxies');
    }

    // ===== File Type Detection =====
    function getEncryptedExtension(originalName, mimeType) {
        const ext = originalName.split('.').pop().toLowerCase();

        if (mimeType && mimeType.startsWith('image/')) return '.meow';
        if (mimeType && mimeType.startsWith('video/')) return '.mur';
        if (mimeType && mimeType.startsWith('audio/')) return '.mew';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return '.meow';
        if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'].includes(ext)) return '.mur';
        if (['mp3', 'ogg', 'wav', 'aac', 'flac', 'm4a'].includes(ext)) return '.mew';

        return '.enc';
    }

    function getMimeTypeFromEncrypted(filename) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.meow')) return 'image/png';
        if (lower.endsWith('.mur')) return 'video/mp4';
        if (lower.endsWith('.mew')) return 'audio/ogg';
        return 'application/octet-stream';
    }

    function getOriginalName(encryptedName) {
        if (encryptedName.endsWith('.meow') || encryptedName.endsWith('.mur') || 
            encryptedName.endsWith('.mew') || encryptedName.endsWith('.enc')) {
            return encryptedName.slice(0, -4);
        }
        return encryptedName;
    }

    // ===== Key State =====
    function getKeyState(peerId) {
        return keyStates[peerId] || 'none';
    }

    function isE2EEstablished(peerId) {
        return keyStates[peerId] === 'established' || !!storage.get('peer_pub_' + peerId);
    }

    function resetKeyState(peerId) {
        delete keyStates[peerId];
        storage.remove('peer_pub_' + peerId);
    }

    // ===== Cache Management =====
    function clearCache() {
        decryptedCache.clear();
        fileCache.clear();
    }

    function getFileCache(docId) {
        return fileCache.get(docId) || null;
    }

    function setFileCache(docId, url) {
        fileCache.set(docId, url);
    }

    // ===== Public API =====
    return {
        TAGS,
        encryptText,
        decryptText,
        encryptBinary,
        decryptBinary,
        sendPublicKey,
        handleKeyExchange,
        deriveSharedKey,
        ensureKeyPair,
        fetchBinary,
        getEncryptedExtension,
        getMimeTypeFromEncrypted,
        getOriginalName,
        getKeyState,
        isE2EEstablished,
        resetKeyState,
        clearCache,
        getFileCache,
        setFileCache,
        bytesToBase64,
        base64ToBytes
    };
})();

