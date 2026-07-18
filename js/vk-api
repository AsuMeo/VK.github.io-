/**
 * VK Meow Crypt - VK API Module
 */

const VKAPI = (function() {
    'use strict';

    let botToken = '';
    let currentUser = null;
    let isInitialized = false;
    const API_VERSION = '5.131';  // Back to working version

    function setToken(token) {
        botToken = token;
        isInitialized = true;
        console.log('[VKAPI] Token set, length:', token.length);
    }

    function getToken() { return botToken; }
    function clearToken() { botToken = ''; isInitialized = false; currentUser = null; }
    function getUser() { return currentUser; }

    // Safe storage
    const storage = {
        get(k) { try { return localStorage.getItem(k); } catch(e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch(e) {} },
        remove(k) { try { localStorage.removeItem(k); } catch(e) {} }
    };

    // Rate limiting
    let lastCall = 0;
    const MIN_INTERVAL = 340;
    const queue = [];
    let processing = false;

    async function call(method, params) {
        if (!isInitialized) throw new Error('VK API not initialized');

        return new Promise((resolve, reject) => {
            const doCall = async () => {
                const now = Date.now();
                if (now - lastCall < MIN_INTERVAL) {
                    await new Promise(r => setTimeout(r, MIN_INTERVAL - (now - lastCall)));
                }
                lastCall = Date.now();

                try {
                    const result = await jsonpCall(method, params);
                    resolve(result);
                } catch (e) {
                    reject(e);
                } finally {
                    processQueue();
                }
            };
            queue.push(doCall);
            if (!processing) processQueue();
        });
    }

    async function processQueue() {
        if (processing || queue.length === 0) return;
        processing = true;
        const call = queue.shift();
        await call();
        processing = false;
        if (queue.length > 0) setTimeout(processQueue, MIN_INTERVAL);
    }

    function jsonpCall(method, params) {
        return new Promise((resolve, reject) => {
            const cbName = 'vk_cb_' + Math.round(Math.random() * 10000000);
            params.access_token = botToken;
            params.v = API_VERSION;
            params.callback = cbName;

            const qs = Object.keys(params)
                .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
                .join('&');

            const script = document.createElement('script');
            script.src = 'https://api.vk.com/method/' + method + '?' + qs;

            console.log('[VKAPI] Calling:', method);

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('VK API timeout for ' + method));
            }, 30000);

            window[cbName] = function(response) {
                clearTimeout(timeout);
                cleanup();
                console.log('[VKAPI] Response for', method, ':', response ? 'received' : 'empty');

                if (response && response.error) {
                    console.error('[VKAPI] Error:', response.error);
                    reject(new Error(response.error.error_msg || 'VK API Error'));
                } else if (response && response.response) {
                    resolve(response.response);
                } else {
                    reject(new Error('Invalid VK API response'));
                }
            };

            script.onerror = function() {
                clearTimeout(timeout);
                cleanup();
                reject(new Error('Failed to load script for ' + method));
            };

            function cleanup() {
                delete window[cbName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            document.body.appendChild(script);
        });
    }

    async function getCurrentUser() {
        if (currentUser) return currentUser;
        const users = await call('users.get', { fields: 'photo_100,photo_200,online' });
        if (users && users.length > 0) {
            currentUser = users[0];
            return currentUser;
        }
        throw new Error('Failed to get user info');
    }

    async function getDialogs(count) {
        const data = await call('messages.getConversations', { count: count || 100, extended: 1, filter: 'all' });
        const profiles = {};

        if (data.profiles) {
            data.profiles.forEach(p => {
                profiles[p.id] = { name: p.first_name + ' ' + p.last_name, photo: p.photo_100, type: 'private', online: p.online === 1 };
            });
        }
        if (data.groups) {
            data.groups.forEach(g => {
                profiles[-g.id] = { name: g.name, photo: g.photo_100, type: 'group', online: false };
            });
        }

        const dialogs = [];
        for (const item of (data.items || [])) {
            const peerId = item.conversation.peer.id;
            const info = profiles[peerId] || { id: peerId, name: 'ID ' + peerId, photo: '', type: 'private', online: false };
            dialogs.push({
                id: peerId, name: info.name, photo: info.photo, type: info.type,
                online: info.online, lastMessage: item.last_message || null,
                unreadCount: item.conversation.unread_count || 0
            });
        }
        return dialogs;
    }

    async function getHistory(peerId, offset, count) {
        const data = await call('messages.getHistory', {
            peer_id: peerId, count: count || 100, offset: offset || 0, extended: 1
        });

        const profiles = {};
        if (data.profiles) {
            data.profiles.forEach(p => { profiles[p.id] = p.first_name + ' ' + p.last_name; });
        }

        const messages = [];
        for (const item of (data.items || [])) {
            messages.push({
                id: item.id, text: item.text || '', rawText: item.text || '',
                time: item.date * 1000, out: item.from_id === (currentUser ? currentUser.id : 0),
                fromId: item.from_id, fromName: profiles[item.from_id] || '',
                attachments: item.attachments || []
            });
        }
        return { messages: messages.reverse(), count: data.count || 0 };
    }

    async function sendMessage(peerId, text, attachment) {
        const randomId = Math.floor(Math.random() * 2000000000);
        const params = { peer_id: peerId, random_id: randomId, message: text };
        if (attachment) params.attachment = attachment;
        return await call('messages.send', params);
    }

    async function uploadDocument(peerId, fileBlob, fileName) {
        const uploadServer = await call('docs.getMessagesUploadServer', { peer_id: peerId, type: 'doc' });
        const formData = new FormData();
        formData.append('file', fileBlob, fileName);

        const res = await fetch(uploadServer.upload_url, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed: ' + res.status);

        const uploadData = await res.json();
        if (!uploadData.file) throw new Error('Upload failed: no file');

        const savedDoc = await call('docs.save', { file: uploadData.file, title: fileName });
        if (!savedDoc.doc) throw new Error('Failed to save document');
        return 'doc' + savedDoc.doc.owner_id + '_' + savedDoc.doc.id;
    }

    async function getNewsfeed(count) {
        return await call('newsfeed.get', { count: count || 20, filters: 'post' });
    }

    async function markAsRead(peerId) {
        try { await call('messages.markAsRead', { peer_id: peerId }); } catch (e) {}
    }

    function parseToken(input) {
        let token = input.trim();
        if (token.includes('access_token=')) {
            const match = token.match(/access_token=([^&]+)/);
            if (match) token = match[1];
        }
        if (!token || token.length < 10) return null;
        return token;
    }

    return {
        setToken, getToken, clearToken, getUser, getCurrentUser,
        getDialogs, getHistory, sendMessage, uploadDocument,
        getNewsfeed, markAsRead, parseToken
    };
})();
