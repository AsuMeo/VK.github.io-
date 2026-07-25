// ================= INDEXEDDB SECURITY STORAGE =================
const dbName = "vktg_secure_vault_v4";
const storeName = "crypto_keys_v4";

function openSecureDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}
async function saveSecureKey(key, value) {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function getSecureKey(key) {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ================= BASE64 HELPERS (chunked) =================
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.byteLength)));
  }
  return btoa(binary);
}
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ================= SEEDABLE PRNG (Steganography) =================
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
function getPRNG(seedString) {
  let h = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    h = Math.imul(h ^ seedString.charCodeAt(i), 16777619);
  }
  return mulberry32(h >>> 0);
}

// ================= STEGANOGRAPHY ENGINE =================
async function embedKeyInImage(imgDataUrl, textPayload, seedString) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      const payloadBytes = new TextEncoder().encode(textPayload);
      const totalLength = payloadBytes.length;
      const buffer = new Uint8Array(4 + totalLength);
      buffer[0] = (totalLength >>> 24) & 0xFF;
      buffer[1] = (totalLength >>> 16) & 0xFF;
      buffer[2] = (totalLength >>> 8) & 0xFF;
      buffer[3] = totalLength & 0xFF;
      buffer.set(payloadBytes, 4);

      const totalBits = buffer.length * 8;
      if (totalBits > (data.length * 3) / 4) {
        reject(new Error("Картинка слишком мала для скрытия ключа!"));
        return;
      }

      const prng = getPRNG(seedString);
      let bitPtr = 0, pixelIdx = 0;
      while (bitPtr < totalBits) {
        pixelIdx += Math.floor(prng() * 4) + 1;
        const channel = Math.floor(prng() * 3);
        const dataIdx = (pixelIdx * 4) + channel;
        if (dataIdx >= data.length) { reject(new Error("Переполнение!")); return; }
        const byteIdx = Math.floor(bitPtr / 8);
        const bitShift = 7 - (bitPtr % 8);
        const bit = (buffer[byteIdx] >>> bitShift) & 1;
        data[dataIdx] = (data[dataIdx] & 0xFE) | bit;
        bitPtr++;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Не удалось прочитать картинку."));
    img.src = imgDataUrl;
  });
}

async function extractKeyFromImage(imgDataUrl, seedString) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      const prng = getPRNG(seedString);
      let pixelIdx = 0;
      const headerBuffer = new Uint8Array(4);
      let bitPtr = 0;
      while (bitPtr < 32) {
        pixelIdx += Math.floor(prng() * 4) + 1;
        const channel = Math.floor(prng() * 3);
        const dataIdx = (pixelIdx * 4) + channel;
        if (dataIdx >= data.length) { reject(new Error("Ошибка заголовка.")); return; }
        const bit = data[dataIdx] & 1;
        const byteIdx = Math.floor(bitPtr / 8);
        const bitShift = 7 - (bitPtr % 8);
        headerBuffer[byteIdx] |= (bit << bitShift);
        bitPtr++;
      }
      const payloadLength = (headerBuffer[0] << 24) | (headerBuffer[1] << 16) | (headerBuffer[2] << 8) | headerBuffer[3];
      if (payloadLength <= 0 || payloadLength > 100000) {
        reject(new Error("Ключ не найден. Проверьте Seed."));
        return;
      }
      const payloadBuffer = new Uint8Array(payloadLength);
      let payloadBitPtr = 0;
      const totalPayloadBits = payloadLength * 8;
      while (payloadBitPtr < totalPayloadBits) {
        pixelIdx += Math.floor(prng() * 4) + 1;
        const channel = Math.floor(prng() * 3);
        const dataIdx = (pixelIdx * 4) + channel;
        if (dataIdx >= data.length) { reject(new Error("Стего повреждено.")); return; }
        const bit = data[dataIdx] & 1;
        const byteIdx = Math.floor(payloadBitPtr / 8);
        const bitShift = 7 - (payloadBitPtr % 8);
        payloadBuffer[byteIdx] |= (bit << bitShift);
        payloadBitPtr++;
      }
      try { resolve(new TextDecoder().decode(payloadBuffer)); }
      catch (e) { reject(new Error("Сбой декодирования.")); }
    };
    img.onerror = () => reject(new Error("Не удалось открыть стего-файл."));
    img.src = imgDataUrl;
  });
}

// ================= CRYPTOGRAPHIC ENGINE =================
async function deriveMasterKey(password, salt) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function generateIdentityKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
  );
}

async function exportPublicJWK(keyPair) {
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return btoa(JSON.stringify(jwk));
}

async function exportPrivateJWK(keyPair) {
  return crypto.subtle.exportKey("jwk", keyPair.privateKey);
}

async function importPrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
}

async function computeSharedSecret(peerPubKeyB64, myPrivKeyObj) {
  const partnerJwk = JSON.parse(atob(peerPubKeyB64));
  const partnerPublicKeyObj = await crypto.subtle.importKey("jwk", partnerJwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
  return crypto.subtle.deriveBits({ name: "ECDH", public: partnerPublicKeyObj }, myPrivKeyObj, 256);
}

async function deriveRatchetMessageKey(initialSharedSecret, sequenceNum, myId, peerId) {
  const salt = new TextEncoder().encode(`ratchet-salt-${Math.min(myId, peerId)}`);
  const info = new TextEncoder().encode(`vktg-msg-chain|${Math.min(myId, peerId)}|${Math.max(myId, peerId)}|${sequenceNum}`);
  const rawSecretKey = await crypto.subtle.importKey("raw", initialSharedSecret, { name: "HKDF" }, false, ["deriveKey"]);
  const chainStartKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    rawSecretKey, { name: "HMAC", hash: "SHA-256", length: 256 }, true, ["sign"]
  );
  const exportedChainKey = await crypto.subtle.exportKey("raw", chainStartKey);
  let currentChainKeyBytes = new Uint8Array(exportedChainKey);
  const enc = new TextEncoder();
  const msgConstant = enc.encode("msg-key");
  const chainConstant = enc.encode("chain-key");
  let lastMsgKeyBytes = null;
  for (let i = 0; i < sequenceNum; i++) {
    const keyObj = await crypto.subtle.importKey("raw", currentChainKeyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const msgSignature = await crypto.subtle.sign("HMAC", keyObj, msgConstant);
    lastMsgKeyBytes = new Uint8Array(msgSignature);
    const chainSignature = await crypto.subtle.sign("HMAC", keyObj, chainConstant);
    currentChainKeyBytes = new Uint8Array(chainSignature);
  }
  return crypto.subtle.importKey("raw", lastMsgKeyBytes, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptDataPFS(recipientPubJWKB64, arrayBufferOrBytes, sequenceNum, myId, partnerId, privKeyObj) {
  const sharedBits = await computeSharedSecret(recipientPubJWKB64, privKeyObj);
  const aesKey = await deriveRatchetMessageKey(sharedBits, sequenceNum, myId, partnerId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, arrayBufferOrBytes);
  return { ivB64: arrayBufferToBase64(iv.buffer), ciphertextBuffer: ciphertext };
}

async function decryptDataPFS(peerPubKeyB64, ivB64, ciphertextB64, sequenceNum, myId, partnerId, privKeyObj) {
  const sharedBits = await computeSharedSecret(peerPubKeyB64, privKeyObj);
  const aesKey = await deriveRatchetMessageKey(sharedBits, sequenceNum, myId, partnerId);
  const iv = new Uint8Array(base64ToArrayBuffer(ivB64));
  const ciphertext = new Uint8Array(base64ToArrayBuffer(ciphertextB64));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
}

async function calcSafetyNumber(myPubKeyJWKB64, peerPubKeyJWKB64) {
  try {
    const sorted = [atob(myPubKeyJWKB64), atob(peerPubKeyJWKB64)].sort();
    const combined = sorted[0] + sorted[1];
    const data = new TextEncoder().encode(combined);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    let digits = '';
    for (let i = 0; i < hashArray.length - 1; i += 2) {
      const val = (hashArray[i] << 8) | hashArray[i + 1];
      digits += val.toString().padStart(5, '0');
    }
    digits = digits.slice(0, 60);
    return digits.match(/.{1,5}/g).join(' ');
  } catch (e) {
    return "ERROR";
  }
}

// ================= VAULT UNLOCK (PBKDF2 + IndexedDB) =================
async function unlockVault(password) {
  const storedSalt = await getSecureKey("vault_salt");
  const storedEncryptedPriv = await getSecureKey("encrypted_private_key");
  const storedPub = await getSecureKey("public_key_jwk");

  if (!storedEncryptedPriv || !storedSalt) {
    // First run: generate new keys
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const newKeys = await generateIdentityKeyPair();
    const pubJwk = await crypto.subtle.exportKey("jwk", newKeys.publicKey);
    const privJwk = await crypto.subtle.exportKey("jwk", newKeys.privateKey);
    const mKey = await deriveMasterKey(password, salt);
    const rawPrivBytes = new TextEncoder().encode(JSON.stringify(privJwk));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedPriv = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, mKey, rawPrivBytes);

    await saveSecureKey("vault_salt", salt);
    await saveSecureKey("encrypted_private_key", { ciphertext: encryptedPriv, iv });
    await saveSecureKey("public_key_jwk", pubJwk);

    const pubKeyB64 = btoa(JSON.stringify(pubJwk));
    return { keyPair: newKeys, pubKeyB64, isNew: true };
  } else {
    // Existing vault: decrypt
    const mKey = await deriveMasterKey(password, storedSalt);
    try {
      const decryptedPrivBytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: storedEncryptedPriv.iv }, mKey, storedEncryptedPriv.ciphertext
      );
      const privJwk = JSON.parse(new TextDecoder().decode(decryptedPrivBytes));
      const pub = await crypto.subtle.importKey("jwk", storedPub, { name: "ECDH", namedCurve: "P-256" }, true, []);
      const priv = await importPrivateKey(privJwk);
      const pubKeyB64 = btoa(JSON.stringify(storedPub));
      return { keyPair: { publicKey: pub, privateKey: priv }, pubKeyB64, isNew: false };
    } catch (e) {
      throw new Error("Неверный пароль!");
    }
  }
}

// ================= MEDIA DECRYPTION =================
async function decryptMediaFile(docUrl, sequence, ivB64, name, mime, myId, partnerId, peerKeyB64, privKeyObj) {
  const response = await fetch(docUrl);
  const base64Text = await response.text();
  const encryptedBuffer = base64ToArrayBuffer(base64Text);
  const decryptedBytes = await decryptDataPFS(peerKeyB64, ivB64, base64Text, parseInt(sequence), myId, partnerId, privKeyObj);

  let finalMime = mime;
  if (name.endsWith('.mur')) finalMime = 'image/png';
  else if (name.endsWith('.meow')) finalMime = 'video/mp4';
  else if (name.endsWith('.meo')) finalMime = 'audio/webm';
  else if (name.endsWith('.me')) finalMime = 'video/webm';

  const blob = new Blob([decryptedBytes], { type: finalMime });
  return URL.createObjectURL(blob);
}
