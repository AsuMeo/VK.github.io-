// ================= MAIN APP COMPONENT =================
const PREFIX_KEY_EXCHANGE = "🔑[VKTG_KEY_V4]:";
const PREFIX_E2EE_TEXT = "🔒[VKTG_E2EE_V5]:";
const PREFIX_E2EE_FILE = "🔒[VKTG_FILE_E2EE_V5]:";

function App() {
  // Auth state
  const [user, setUser] = createSignal(null);
  const [authScreen, setAuthScreen] = createSignal('login'); // 'login' | 'register'
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [displayName, setDisplayName] = createSignal('');
  const [authError, setAuthError] = createSignal('');
  const [authLoading, setAuthLoading] = createSignal(false);

  // Vault
  const [isVaultLocked, setIsVaultLocked] = createSignal(true);
  const [vaultPassword, setVaultPassword] = createSignal('');
  const [vaultError, setVaultError] = createSignal('');

  // Crypto
  const [identityKeyPair, setIdentityKeyPair] = createSignal(null);
  const [myPublicJWK, setMyPublicJWK] = createSignal('');
  const [peerKeys, setPeerKeys] = createSignal({});

  // UI
  const [activeScreen, setActiveScreen] = createSignal('chats');
  const [activeTab, setActiveTab] = createSignal('all');
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [newChatModal, setNewChatModal] = createSignal(false);
  const [safetyNumberModal, setSafetyNumberModal] = createSignal(false);
  const [safetyNumber, setSafetyNumber] = createSignal('');
  const [attachmentSheet, setAttachmentSheet] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [messageInput, setMessageInput] = createSignal('');

  // Chat
  const [conversations, setConversations] = createSignal([]);
  const [messages, setMessages] = createSignal([]);
  const [activePartner, setActivePartner] = createSignal(null);
  const [partnerTyping, setPartnerTyping] = createSignal(false);

  // OOB / Stego
  const [oobModalOpen, setOobModalOpen] = createSignal(false);
  const [oobTab, setOobTab] = createSignal('qr');
  const [stegoBaseImg, setStegoBaseImg] = createSignal(null);
  const [stegoCustomSeed, setStegoCustomSeed] = createSignal('');
  const [generatedStegoUrl, setGeneratedStegoUrl] = createSignal(null);
  const [stegoExtractImg, setStegoExtractImg] = createSignal(null);
  const [stegoExtractSeed, setStegoExtractSeed] = createSignal('');

  // Recording
  const [isRecordingAudio, setIsRecordingAudio] = createSignal(false);
  const [isRecordingCircle, setIsRecordingCircle] = createSignal(false);
  let audioRecorder = null;
  let circleRecorder = null;
  let circleStream = null;

  // Refs
  let messagesEndRef = null;
  let circlePreviewRef = null;

  // ================= AUTH LISTENER =================
  createEffect(() => {
    const unsub = fbOnAuth(async (u) => {
      if (u) {
        setUser(u);
        const profile = await fbGetUserProfile(u.uid);
        if (profile) {
          setDisplayName(profile.displayName || u.email.split('@')[0]);
        }
        fbSetOnline(u.uid);
      } else {
        setUser(null);
        setIsVaultLocked(true);
        setIdentityKeyPair(null);
        setMyPublicJWK('');
        setPeerKeys({});
      }
    });
    onCleanup(unsub);
  });

  // ================= CONVERSATIONS LISTENER =================
  createEffect(() => {
    const u = user();
    if (!u || isVaultLocked()) return;
    const unsub = fbOnConversations(u.uid, (items) => {
      setConversations(items);
    });
    onCleanup(() => fbOffConversations(u.uid));
  });

  // ================= MESSAGES LISTENER =================
  createEffect(() => {
    const u = user();
    const p = activePartner();
    if (!u || !p || isVaultLocked()) return;
    const unsub = fbOnMessages(u.uid, p.id, async (msgs) => {
      const decrypted = [];
      for (const item of msgs) {
        const isMe = item.senderId === u.uid;
        let text = item.text || '';
        let payload = null;

        if (text.startsWith(PREFIX_KEY_EXCHANGE)) {
          const rawKey = text.replace(PREFIX_KEY_EXCHANGE, '').trim();
          setPeerKeys(prev => ({ ...prev, [item.senderId]: rawKey }));
          payload = { isSystem: true, text: '🔑 Синхронизирована новая пара асимметричных ключей E2EE.' };
          if (!isMe) {
            await sendKeyExchange(p.id);
          }
        } else if (text.startsWith(PREFIX_E2EE_TEXT)) {
          const parts = text.replace(PREFIX_E2EE_TEXT, '').trim().split(':');
          if (parts.length === 3) {
            const [seq, iv, cipher] = parts;
            const kp = identityKeyPair();
            if (kp) {
              try {
                const decryptedBytes = await decryptDataPFS(
                  peerKeys()[p.id], iv, cipher, parseInt(seq), u.uid, p.id, kp.privateKey
                );
                const data = JSON.parse(new TextDecoder().decode(decryptedBytes));
                payload = { isText: true, text: data.text };
              } catch (e) {
                payload = { isError: true, text: '🔒 Ошибка расшифрования.' };
              }
            }
          }
        } else if (text.startsWith(PREFIX_E2EE_FILE)) {
          const parts = text.replace(PREFIX_E2EE_FILE, '').trim().split(':');
          if (parts.length >= 4) {
            const [seq, iv, b64Name, mime] = parts;
            payload = { isFile: true, name: atob(b64Name), mime, docUrl: item.docUrl, sequence: seq, iv };
          }
        }

        decrypted.push({ ...item, isMe, decrypted: payload });
      }
      setMessages(decrypted);
    });
    onCleanup(() => fbOffMessages(u.uid, p.id));
  });

  // ================= PARTNER TYPING LISTENER =================
  createEffect(() => {
    const u = user();
    const p = activePartner();
    if (!u || !p) return;
    const unsub = fbOnPartnerTyping(u.uid, p.id, (typing) => setPartnerTyping(typing));
    onCleanup(unsub);
  });

  // ================= AUTO SCROLL =================
  createEffect(() => {
    if (messagesEndRef) messagesEndRef.scrollIntoView({ behavior: 'smooth' });
  });

  // ================= SAFETY NUMBER =================
  createEffect(() => {
    if (safetyNumberModal() && activePartner() && peerKeys()[activePartner().id]) {
      calcSafetyNumber(myPublicJWK(), peerKeys()[activePartner().id]).then(setSafetyNumber);
    } else {
      setSafetyNumber('Ключи не обменены');
    }
  });

  // ================= AUTH HANDLERS =================
  const handleRegister = async () => {
    if (!email() || !password() || password().length < 6) {
      setAuthError('Email и пароль (мин. 6 символов) обязательны');
      return;
    }
    setAuthLoading(true);
    try {
      const cred = await fbRegister(email(), password());
      await fbSetUserProfile(cred.user.uid, {
        displayName: displayName() || email().split('@')[0],
        email: email(),
        createdAt: Date.now()
      });
      setAuthError('');
    } catch (e) {
      setAuthError(e.message);
    }
    setAuthLoading(false);
  };

  const handleLogin = async () => {
    if (!email() || !password()) {
      setAuthError('Введите email и пароль');
      return;
    }
    setAuthLoading(true);
    try {
      await fbLogin(email(), password());
      setAuthError('');
    } catch (e) {
      setAuthError(e.message);
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await fbLogout();
    setDrawerOpen(false);
    setActiveScreen('chats');
    setActivePartner(null);
  };

  // ================= VAULT UNLOCK =================
  const handleUnlockVault = async () => {
    if (!vaultPassword().trim()) { setVaultError('Пароль не может быть пустым!'); return; }
    try {
      const result = await unlockVault(vaultPassword());
      setIdentityKeyPair(result.keyPair);
      setMyPublicJWK(result.pubKeyB64);
      setIsVaultLocked(false);
      setVaultError('');

      // Load cached peer keys
      const db = await openSecureDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const keys = {};
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.key.startsWith('trusted_key_')) {
            const pId = cursor.key.replace('trusted_key_', '');
            keys[pId] = cursor.value;
          }
          cursor.continue();
        } else {
          setPeerKeys(keys);
        }
      };

      // Publish public key to Firebase
      const u = user();
      if (u && result.pubKeyB64) {
        await fbSetPublicKey(u.uid, result.pubKeyB64);
      }
    } catch (err) {
      setVaultError(err.message);
    }
  };

  // ================= CHAT ACTIONS =================
  const sendKeyExchange = async (partnerId) => {
    const pub = myPublicJWK();
    if (!pub) return;
    await fbSendMessage(user().uid, partnerId, {
      text: PREFIX_KEY_EXCHANGE + pub,
      type: 'system'
    });
  };

  const handleSendMessage = async () => {
    const u = user();
    const p = activePartner();
    const text = messageInput().trim();
    if (!u || !p || !text) return;
    const pk = peerKeys()[p.id];
    if (!pk) { alert('Необходимо обменяться ключами E2EE!'); return; }

    try {
      const savedSeq = await getSecureKey(`seq_sent_${p.id}`);
      const sequence = (savedSeq ? parseInt(savedSeq) : 0) + 1;
      await saveSecureKey(`seq_sent_${p.id}`, sequence);

      const randomPad = crypto.getRandomValues(new Uint8Array(Math.floor(Math.random() * 128) + 16));
      const payloadData = {
        text: text,
        timestamp: Date.now(),
        sender_id: u.uid,
        recipient_id: p.id,
        sequence: sequence,
        _pad: btoa(String.fromCharCode(...randomPad))
      };
      const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadData));
      const encrypted = await encryptDataPFS(pk, payloadBytes, sequence, u.uid, p.id, identityKeyPair().privateKey);

      const payload = PREFIX_E2EE_TEXT + sequence + ':' + encrypted.ivB64 + ':' + arrayBufferToBase64(encrypted.ciphertextBuffer);
      await fbSendMessage(u.uid, p.id, { text: payload, type: 'text' });
      setMessageInput('');
    } catch (e) {
      alert('Ошибка отправки: ' + e.message);
    }
  };

  const sendEncryptedFile = async (arrayBuffer, filename, mimeType) => {
    const u = user();
    const p = activePartner();
    if (!u || !p) return;
    const pk = peerKeys()[p.id];
    if (!pk) { alert('Необходимо обменяться ключами E2EE!'); return; }

    try {
      const savedSeq = await getSecureKey(`seq_sent_${p.id}`);
      const sequence = (savedSeq ? parseInt(savedSeq) : 0) + 1;
      await saveSecureKey(`seq_sent_${p.id}`, sequence);

      const encrypted = await encryptDataPFS(pk, arrayBuffer, sequence, u.uid, p.id, identityKeyPair().privateKey);
      const encryptedBase64Str = arrayBufferToBase64(encrypted.ciphertextBuffer);

      // Upload to Firebase Realtime DB (base64 stored directly — no Storage needed!)
      const fileRef = db.ref(`files/${u.uid}/${Date.now()}`);
      await fileRef.set({ data: encryptedBase64Str, name: filename, mime: mimeType });
      const docUrl = null; // We'll read directly from RTDB in real scenario

      // For demo: create a data URL from the base64 for the viewer
      const b64Name = btoa(filename);
      const header = PREFIX_E2EE_FILE + sequence + ':' + encrypted.ivB64 + ':' + b64Name + ':' + mimeType;

      await fbSendMessage(u.uid, p.id, {
        text: header,
        type: 'file',
        docUrl: encryptedBase64Str // Store encrypted base64 directly in message for instant access
      });

      // Also add/update conversation entry
      await fbConversationsRef(u.uid).child(p.id).set({
        partner: { id: p.id, displayName: p.displayName || 'User', photoURL: p.photoURL || '' },
        lastMessage: { text: '🔒 Файл', timestamp: Date.now() },
        unreadCount: 0
      });

      setAttachmentSheet(false);
    } catch (e) {
      alert('Ошибка отправки файла: ' + e.message);
    }
  };

  // ================= FILE HANDLER =================
  const handleFileSelection = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      await sendEncryptedFile(evt.target.result, file.name, file.type || 'application/octet-stream');
    };
    reader.readAsArrayBuffer(file);
  };

  // ================= AUDIO RECORDING =================
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      audioRecorder = new MediaRecorder(stream);
      audioRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      audioRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const arrBuffer = await blob.arrayBuffer();
        await sendEncryptedFile(arrBuffer, `voice_${Date.now()}.meo`, 'audio/webm');
        stream.getTracks().forEach(t => t.stop());
      };
      audioRecorder.start();
      setIsRecordingAudio(true);
    } catch (e) {
      alert('Ошибка микрофона: ' + e.message);
    }
  };

  const stopAudioRecording = () => {
    if (audioRecorder && audioRecorder.state !== 'inactive') audioRecorder.stop();
    setIsRecordingAudio(false);
  };

  // ================= CIRCLE VIDEO RECORDING =================
  const startCircleRecording = async () => {
    try {
      circleStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 }, audio: true
      });
      setTimeout(() => { if (circlePreviewRef) circlePreviewRef.srcObject = circleStream; }, 150);
      const chunks = [];
      circleRecorder = new MediaRecorder(circleStream, { mimeType: 'video/webm;codecs=vp8,opus' });
      circleRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      circleRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const arrBuffer = await blob.arrayBuffer();
        await sendEncryptedFile(arrBuffer, `circle_${Date.now()}.me`, 'video/webm');
        circleStream.getTracks().forEach(t => t.stop());
      };
      circleRecorder.start();
      setIsRecordingCircle(true);
    } catch (e) {
      alert('Ошибка камеры: ' + e.message);
    }
  };

  const stopCircleRecording = () => {
    if (circleRecorder && circleRecorder.state !== 'inactive') circleRecorder.stop();
    setIsRecordingCircle(false);
    circleStream = null;
  };

  // ================= NEW CHAT =================
  const handleStartNewChat = async () => {
    const targetEmail = prompt('Введите email собеседника:');
    if (!targetEmail) return;
    // In real app: lookup user by email in Firebase
    // For demo: create a mock partner
    const mockPartner = {
      id: 'user_' + btoa(targetEmail).slice(0, 8),
      displayName: targetEmail.split('@')[0],
      photoURL: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(targetEmail) + '&background=0ea5e9&color=fff'
    };
    setNewChatModal(false);
    handleSelectChat(mockPartner);
  };

  const handleSelectChat = (partner) => {
    setActivePartner(partner);
    setActiveScreen('chat_room');
    setMessages([]);
  };

  // ================= STEGO =================
  const runStegoEncryption = async () => {
    if (!stegoBaseImg()) { alert('Загрузите исходную картинку!'); return; }
    const u = user();
    const p = activePartner();
    if (!u || !myPublicJWK()) { alert('Ключи не готовы'); return; }
    const seed = stegoCustomSeed().trim() || String(Math.min(u.uid.length, p ? p.id.length : 0)) + 'stego';
    try {
      const outPngUrl = await embedKeyInImage(stegoBaseImg(), myPublicJWK(), seed);
      setGeneratedStegoUrl(outPngUrl);
      alert('Ключ спрятан в пикселях! Скачайте PNG.');
    } catch (e) {
      alert('Сбой стеганографии: ' + e.message);
    }
  };

  const runStegoDecryption = async () => {
    if (!stegoExtractImg()) { alert('Загрузите стего-картинку!'); return; }
    const u = user();
    const p = activePartner();
    const seed = stegoExtractSeed().trim() || String(Math.min(u.uid.length, p ? p.id.length : 0)) + 'stego';
    try {
      const extractedKey = await extractKeyFromImage(stegoExtractImg(), seed);
      if (p) {
        await saveSecureKey(`trusted_key_${p.id}`, extractedKey);
        setPeerKeys(prev => ({ ...prev, [p.id]: extractedKey }));
      }
      alert('Ключ извлечен и импортирован!');
    } catch (e) {
      alert('Не удалось извлечь: ' + e.message);
    }
  };

  // ================= PROFILE UPDATE =================
  const handleSaveProfile = async () => {
    const u = user();
    if (!u) return;
    await fbUpdateUserProfile(u.uid, { displayName: displayName() });
    setSettingsOpen(false);
    alert('Профиль сохранен!');
  };

  // ================= RENDER: VAULT WALL =================
  if (user() && isVaultLocked()) {
    return h('div', { class: 'h-screen w-full flex items-center justify-center bg-[#070a0e] p-4 text-white' },
      h('div', { class: 'w-full max-w-sm bg-[#0e141c] rounded-2xl p-6 border border-[#223145] shadow-2xl flex flex-col items-center space-y-5' },
        h('div', { class: 'w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center' },
          h(Icons.Lock, { className: 'w-7 h-7' })
        ),
        h('div', { class: 'text-center' },
          h('h2', { class: 'text-lg font-bold' }, 'Сейф шифрования'),
          h('p', { class: 'text-xs text-[#738294] mt-2 leading-relaxed' },
            'Введите пароль для дешифрования приватных ключей E2EE. Если первый запуск — придумайте новый пароль (PBKDF2-600k).'
          )
        ),
        h('input', {
          type: 'password', placeholder: 'Мастер-Пароль',
          value: vaultPassword(),
          onInput: e => setVaultPassword(e.target.value),
          class: 'w-full bg-[#05070a] text-sm text-white px-4 py-3 rounded-xl border border-[#1b2533] focus:outline-none focus:border-emerald-500 text-center tracking-wider transition'
        }),
        h(Show, { when: vaultError() },
          h('div', { class: 'text-xs text-rose-400 text-center bg-rose-950/20 py-1.5 px-3 rounded-lg w-full border border-rose-900/30' }, vaultError())
        ),
        h('button', {
          onClick: handleUnlockVault,
          class: 'w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-xl text-xs font-bold tracking-wider transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40'
        }, h(Icons.Lock, { className: 'w-4 h-4' }), 'РАЗБЛОКИРОВАТЬ')
      )
    );
  }

  // ================= RENDER: AUTH WALL =================
  if (!user()) {
    return h('div', { class: 'h-screen w-full flex items-center justify-center bg-[#070a0e] p-4 text-white' },
      h('div', { class: 'w-full max-w-sm bg-[#0e141c] rounded-2xl p-6 border border-[#223145] shadow-2xl flex flex-col items-center' },
        h('div', { class: 'w-16 h-16 bg-[#213043] rounded-2xl flex items-center justify-center mb-5 border border-[#304662] shadow-inner' },
          h(Icons.Lock, { className: 'w-8 h-8 text-sky-400' })
        ),
        h('h2', { class: 'text-xl font-bold tracking-tight mb-1 text-center' }, 'VKTG Secure'),
        h('p', { class: 'text-xs text-[#738294] mb-6 text-center leading-relaxed' }, 'E2EE мессенджер на Firebase Realtime Database'),

        h('div', { class: 'w-full space-y-4' },
          h(Show, { when: authScreen() === 'register' },
            h('div', null,
              h('label', { class: 'block text-[10px] text-[#738294] font-semibold mb-1.5 uppercase tracking-wider' }, 'Отображаемое имя'),
              h('input', {
                type: 'text', placeholder: 'Ваше имя',
                value: displayName(),
                onInput: e => setDisplayName(e.target.value),
                class: 'w-full bg-[#05070a] text-xs text-white p-3 rounded-xl border border-[#1b2533] focus:outline-none focus:border-sky-500 transition'
              })
            )
          ),
          h('div', null,
            h('label', { class: 'block text-[10px] text-[#738294] font-semibold mb-1.5 uppercase tracking-wider' }, 'Email'),
            h('input', {
              type: 'email', placeholder: 'email@example.com',
              value: email(),
              onInput: e => setEmail(e.target.value),
              class: 'w-full bg-[#05070a] text-xs text-white p-3 rounded-xl border border-[#1b2533] focus:outline-none focus:border-sky-500 transition'
            })
          ),
          h('div', null,
            h('label', { class: 'block text-[10px] text-[#738294] font-semibold mb-1.5 uppercase tracking-wider' }, 'Пароль'),
            h('input', {
              type: 'password', placeholder: '••••••••',
              value: password(),
              onInput: e => setPassword(e.target.value),
              class: 'w-full bg-[#05070a] text-xs text-white p-3 rounded-xl border border-[#1b2533] focus:outline-none focus:border-sky-500 transition'
            })
          )
        ),

        h('button', {
          onClick: authScreen() === 'login' ? handleLogin : handleRegister,
          disabled: authLoading(),
          class: 'w-full mt-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl text-xs tracking-wider flex items-center justify-center gap-2 transition duration-150 shadow-lg shadow-emerald-950/40 disabled:opacity-50'
        }, authLoading() ? 'Загрузка...' : (authScreen() === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ')),

        h('button', {
          onClick: () => { setAuthScreen(authScreen() === 'login' ? 'register' : 'login'); setAuthError(''); },
          class: 'mt-3 text-xs text-sky-400 hover:text-sky-300 transition'
        }, authScreen() === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'),

        h(Show, { when: authError() },
          h('div', { class: 'w-full mt-4 p-3 bg-rose-950/20 border border-rose-900/40 rounded-xl text-[10px] text-rose-400 font-mono text-center leading-relaxed' }, authError())
        )
      )
    );
  }

  // ================= RENDER: MAIN APP =================
  return h('div', { class: 'mobile-container relative bg-[#080c10]' },

    // CHATS SCREEN
    h(Show, { when: activeScreen() === 'chats' },
      h('div', { class: 'flex-1 flex flex-col overflow-hidden relative' },
        // Header
        h('div', { class: 'bg-[#0e141c] py-4 px-4 flex items-center justify-between border-b border-[#1b2533] shadow-md shrink-0' },
          h('div', { class: 'flex items-center gap-4' },
            h('button', { onClick: () => setDrawerOpen(true), class: 'text-gray-300 hover:text-white transition' }, h(Icons.Menu)),
            h('span', { class: 'text-lg font-bold text-white tracking-wide' }, 'VKTG Secure')
          ),
          h('div', { class: 'text-gray-400' }, h(Icons.Search))
        ),
        // Tabs
        h('div', { class: 'bg-[#0e141c] flex border-b border-[#1b2533] shrink-0 text-xs font-semibold uppercase tracking-wider text-[#738294]' },
          h('button', {
            onClick: () => setActiveTab('all'),
            class: 'flex-1 py-3 text-center border-b-2 transition ' + (activeTab() === 'all' ? 'text-sky-400 border-sky-400 bg-white/5' : 'border-transparent hover:text-white')
          }, 'Все чаты'),
          h('button', {
            onClick: () => setActiveTab('secret'),
            class: 'flex-1 py-3 text-center border-b-2 transition flex items-center justify-center gap-1.5 ' + (activeTab() === 'secret' ? 'text-emerald-400 border-emerald-400 bg-white/5' : 'border-transparent hover:text-white')
          }, h(Icons.Lock, { className: 'w-3.5 h-3.5' }), 'ЗАЩИЩЕННЫЕ')
        ),
        // Search
        h('div', { class: 'bg-[#0e141c]/60 p-2.5 border-b border-[#1b2533] shrink-0' },
          h('input', {
            type: 'text', placeholder: 'Поиск собеседника...',
            value: searchQuery(),
            onInput: e => setSearchQuery(e.target.value),
            class: 'w-full bg-[#05070a] text-xs text-white rounded-lg px-3.5 py-2.5 focus:outline-none border border-transparent focus:border-[#213043] transition'
          })
        ),
        // Dialogues
        h('div', { class: 'flex-1 overflow-y-auto scrollable-area' },
          h(Show, { when: conversations().length === 0 },
            h('div', { class: 'p-12 text-center text-[#738294] text-xs space-y-3' },
              h('div', { class: 'w-12 h-12 bg-[#16212e] rounded-full flex items-center justify-center mx-auto text-sky-400' }, h(Icons.Sync)),
              h('p', null, 'Нет активных диалогов. Начните новый чат!')
            )
          ),
          h(For, { each: conversations().filter(item => {
            const name = (item.partner?.displayName || '').toLowerCase();
            const matches = name.includes(searchQuery().toLowerCase());
            if (activeTab() === 'secret') return matches && peerKeys()[item.partner?.id];
            return matches;
          }) }, (item) => {
            const p = item.partner || {};
            const name = p.displayName || 'Пользователь';
            const time = formatTimestamp(item.lastMessage?.timestamp);
            let preview = item.lastMessage?.text || '';
            let isEnc = false;
            if (preview.startsWith(PREFIX_KEY_EXCHANGE)) { preview = '🔑 Крипто-ключи согласованы'; }
            else if (preview.startsWith(PREFIX_E2EE_TEXT) || preview.startsWith(PREFIX_E2EE_FILE)) { preview = '🔒 Зашифровано PFS'; isEnc = true; }
            return h('div', {
              key: item.id,
              onClick: () => handleSelectChat(p),
              class: 'p-3.5 flex items-center gap-3.5 active:bg-[#121a24] cursor-pointer transition duration-150 border-b border-[#1b2533]/40'
            },
              h('div', { class: 'w-12 h-12 rounded-full relative shrink-0' },
                h('img', { src: p.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=0ea5e9&color=fff', class: 'w-full h-full rounded-full object-cover border border-[#1b2533]' }),
                h('div', { class: 'absolute bottom-0 right-0 w-3 h-3 border-2 border-[#0b0e14] rounded-full bg-gray-500' })
              ),
              h('div', { class: 'flex-1 min-w-0' },
                h('div', { class: 'flex items-center justify-between' },
                  h('span', { class: 'font-bold text-sm text-white truncate' }, name),
                  h('span', { class: 'text-[10px] text-[#738294]' }, time)
                ),
                h('p', { class: 'text-xs ' + (isEnc ? 'text-emerald-400 font-semibold' : 'text-[#738294]') + ' truncate mt-1' }, preview)
              ),
              h(Show, { when: item.unreadCount > 0 },
                h('span', { class: 'bg-emerald-500 text-black font-bold text-[10px] px-2 py-0.5 rounded-full shrink-0' }, item.unreadCount)
              )
            );
          })
        ),
        // FAB
        h('button', {
          onClick: () => setNewChatModal(true),
          class: 'absolute bottom-6 right-6 w-14 h-14 bg-sky-600 hover:bg-sky-500 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition duration-150 z-30 shadow-sky-950/40 border border-sky-400/20'
        }, h(Icons.Edit))
      )
    ),

    // CHAT ROOM SCREEN
    h(Show, { when: activeScreen() === 'chat_room' && activePartner() },
      h('div', { class: 'flex-1 flex flex-col overflow-hidden relative tg-chat-wallpaper' },
        // Header
        h('div', { class: 'bg-[#0e141c] py-3.5 px-4 flex items-center justify-between border-b border-[#1b2533] shadow-md shrink-0 z-20' },
          h('div', { class: 'flex items-center gap-3 min-w-0' },
            h('button', { onClick: () => { setActiveScreen('chats'); setActivePartner(null); }, class: 'text-gray-300 hover:text-white p-1 transition' }, h(Icons.Back)),
            h('div', { class: 'w-10 h-10 rounded-full relative shrink-0' },
              h('img', { src: activePartner()?.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(activePartner()?.displayName || 'U') + '&background=0ea5e9&color=fff', class: 'w-full h-full rounded-full object-cover border border-[#1b2533]' })
            ),
            h('div', { class: 'min-w-0' },
              h('h4', { class: 'font-bold text-sm text-white truncate max-w-[150px]' }, activePartner()?.displayName || 'Загрузка...'),
              h('span', { class: 'text-[10px] text-emerald-400 font-semibold block mt-0.5' },
                partnerTyping() ? 'печатает...' : 'в сети'
              )
            )
          ),
          h('div', { class: 'flex items-center gap-2 shrink-0' },
            h('button', { onClick: () => setOobModalOpen(true), class: 'p-1.5 hover:bg-white/5 rounded-full transition', title: 'Безопасный обмен' }, h(Icons.Qr)),
            h('div', {
              onClick: () => setSafetyNumberModal(true),
              class: 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition duration-150 ' +
                (peerKeys()[activePartner()?.id] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30')
            }, h(Icons.Lock, { className: 'w-3 h-3' }), peerKeys()[activePartner()?.id] ? 'E2EE СЕЙФ' : 'НЕТ КЛЮЧА'),
            h('button', { onClick: () => { sendKeyExchange(activePartner().id); alert('Обмен ключами запущен!'); }, class: 'p-1.5 hover:bg-white/5 rounded-full transition', title: 'Синхронизировать' }, h(Icons.Sync))
          )
        ),

        // Circle recording overlay
        h(Show, { when: isRecordingCircle() },
          h('div', { class: 'absolute inset-0 bg-black/95 z-40 flex flex-col items-center justify-center space-y-6' },
            h('div', { class: 'relative w-64 h-64 rounded-full overflow-hidden border-4 border-emerald-500 shadow-2xl' },
              h('video', { ref: el => circlePreviewRef = el, autoPlay: true, muted: true, playsInline: true, class: 'w-full h-full object-cover' })
            ),
            h('div', { class: 'flex items-center gap-3' },
              h('span', { class: 'w-3 h-3 bg-red-600 rounded-full animate-ping' }),
              h('span', { class: 'text-sm font-bold text-white uppercase tracking-wider' }, 'Запись видео-кружочка...')
            ),
            h('button', { onClick: stopCircleRecording, class: 'px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-full shadow-lg transition' }, 'ЗАВЕРШИТЬ И ОТПРАВИТЬ')
          )
        ),

        // Messages
        h('div', { class: 'flex-1 overflow-y-auto p-4 scrollable-area min-h-0' },
          h(Show, { when: messages().length === 0 },
            h('div', { class: 'm-auto my-12 text-center max-w-[280px] bg-black/50 p-5 rounded-2xl border border-white/5 space-y-3 backdrop-blur-md' },
              h('div', { class: 'w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto' }, h(Icons.Lock, { className: 'w-5 h-5' })),
              h('h5', { class: 'text-xs font-bold text-white uppercase tracking-wider' }, 'Защищенный PFS Сейф'),
              h('p', { class: 'text-[10px] text-[#738294] leading-relaxed' },
                'Все данные шифруются на базе ECDH P-256 + HMAC-SHA256 + AES-GCM 256. Серверы Firebase не имеют доступа к содержимому.'
              )
            )
          ),
          h(For, { each: messages() }, (msg) => {
            const timeStr = formatTimestamp(msg.timestamp);
            if (msg.decrypted?.isSystem) {
              return h('div', { key: msg.id, class: 'mx-auto my-2 bg-[#101721] text-[10px] text-emerald-400 border border-emerald-950/80 px-4 py-1.5 rounded-full text-center max-w-[320px] font-medium tracking-wide block' }, msg.decrypted.text);
            }
            const isMe = msg.isMe;
            const alignClass = isMe ? 'text-right' : 'text-left';
            const bubbleClass = isMe ? 'bubble-out text-left inline-block' : 'bubble-in text-left inline-block';
            return h('div', { key: msg.id, class: 'w-full ' + alignClass + ' mb-3 block' },
              h('div', { class: 'max-w-[85%] p-3 shadow-xl ' + bubbleClass + ' text-white space-y-1' },
                h(Show, { when: msg.decrypted },
                  h('div', null,
                    h(Show, { when: msg.decrypted.isText },
                      h('p', { class: 'text-xs leading-relaxed break-words' }, msg.decrypted.text)
                    ),
                    h(Show, { when: msg.decrypted.isFile },
                      h(DecryptedMediaViewer, {
                        docUrl: 'data:text/plain;base64,' + msg.docUrl,
                        sequence: msg.decrypted.sequence,
                        iv: msg.decrypted.iv,
                        name: msg.decrypted.name,
                        mime: msg.decrypted.mime,
                        myId: user().uid,
                        partnerId: activePartner().id,
                        peerKeyB64: peerKeys()[activePartner().id],
                        privKeyObj: identityKeyPair()?.privateKey
                      })
                    ),
                    h(Show, { when: msg.decrypted.isError },
                      h('p', { class: 'text-xs text-rose-400 font-bold' }, msg.decrypted.text)
                    )
                  )
                ),
                h(Show, { when: !msg.decrypted },
                  h('p', { class: 'text-xs leading-relaxed break-words' }, msg.text || '')
                ),
                h('div', { class: 'flex items-center justify-end gap-1.5 text-[9px] text-white/40 pt-0.5' },
                  h(Show, { when: msg.decrypted }, h(Icons.Lock, { className: 'w-3 h-3 text-emerald-400' })),
                  h('span', null, timeStr),
                  h(Show, { when: isMe }, h('span', { class: 'text-emerald-400' }, '✓✓'))
                )
              )
            );
          }),
          h('div', { ref: el => messagesEndRef = el })
        ),

        // Input
        h('div', { class: 'p-3 bg-[#0e141c] border-t border-[#1b2533] shrink-0 space-y-2.5 z-10' },
          h(Show, { when: isRecordingAudio() },
            h('div', { class: 'flex items-center justify-between bg-[#05070a] p-3 rounded-xl text-xs border border-sky-500/20 animate-pulse' },
              h('div', { class: 'flex items-center gap-2' },
                h('span', { class: 'w-2.5 h-2.5 bg-red-600 rounded-full animate-ping' }),
                h('span', { class: 'text-sky-400 font-bold' }, 'Идет запись аудио сообщения...')
              ),
              h('button', { onClick: stopAudioRecording, class: 'px-3 py-1 bg-red-600 hover:bg-red-500 text-[10px] text-white font-bold rounded-lg transition' }, 'ОТПРАВИТЬ')
            )
          ),
          h('div', { class: 'flex items-end gap-2.5' },
            h('div', { class: 'flex-1 bg-[#05070a] rounded-2xl flex items-end px-3 py-2 border border-[#1b2533]' },
              h('button', { onClick: () => setAttachmentSheet(true), class: 'p-1 text-gray-400 hover:text-white transition shrink-0', title: 'Медиа и файлы' }, h(Icons.Attach)),
              h('textarea', {
                value: messageInput(),
                onInput: e => { setMessageInput(e.target.value); fbSetTyping(user().uid, activePartner().id, e.target.value.length > 0); },
                placeholder: 'Написать зашифрованное сообщение...',
                rows: 1,
                class: 'flex-1 bg-transparent border-0 outline-none text-xs text-white max-h-24 resize-none px-2 py-1 placeholder-gray-500 focus:ring-0'
              }),
              h('button', { onClick: isRecordingAudio() ? stopAudioRecording : startAudioRecording, class: 'p-1 shrink-0 animate-pulse', title: 'Записать аудио' }, h(Icons.Mic))
            ),
            h('button', { onClick: handleSendMessage, class: 'w-10 h-10 bg-sky-600 hover:bg-sky-500 text-white rounded-full flex items-center justify-center shrink-0 active:scale-95 transition duration-150 border border-sky-400/20' }, h(Icons.Send))
          )
        )
      )
    ),

    // OOB MODAL
    h(Show, { when: oobModalOpen() && activePartner() },
      h('div', { class: 'absolute inset-0 bg-black/95 z-50 flex flex-col justify-end' },
        h('div', { class: 'bg-[#0e141c] h-[90%] rounded-t-3xl border-t border-[#1b2533] flex flex-col overflow-hidden relative animate-slide-up' },
          h('div', { class: 'p-4 border-b border-[#1b2533] flex items-center justify-between shrink-0' },
            h('div', { class: 'flex items-center gap-2' },
              h(Icons.Qr),
              h('span', { class: 'text-sm font-bold text-emerald-400 uppercase tracking-wider' }, 'Обмен ключами вне серверов')
            ),
            h('button', { onClick: () => setOobModalOpen(false), class: 'text-gray-400 p-1' }, h(Icons.Close))
          ),
          h('div', { class: 'flex border-b border-[#1b2533] shrink-0 text-xs font-semibold uppercase tracking-wider text-[#738294]' },
            h('button', { onClick: () => setOobTab('qr'), class: 'flex-1 py-3 text-center transition ' + (oobTab() === 'qr' ? 'text-sky-400 border-b-2 border-sky-400 bg-white/5' : 'border-transparent hover:text-white') }, 'QR-Код'),
            h('button', { onClick: () => setOobTab('stego'), class: 'flex-1 py-3 text-center transition ' + (oobTab() === 'stego' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-white/5' : 'border-transparent hover:text-white') }, 'Стеганография')
          ),
          h('div', { class: 'flex-1 overflow-y-auto p-5 space-y-5 scrollable-area' },
            h(Show, { when: oobTab() === 'qr' },
              h('div', { class: 'space-y-4 flex flex-col items-center' },
                h('p', { class: 'text-[11px] text-[#738294] text-center leading-relaxed max-w-xs' },
                  'Ваш публичный ключ (Base64). Скопируйте и отправьте собеседнику через любой канал.'
                ),
                h('div', { class: 'w-full bg-[#05070a] p-3 rounded-xl border border-[#1b2533] font-mono text-[10px] text-emerald-400 break-all select-all max-h-32 overflow-y-auto' }, myPublicJWK()),
                h('button', {
                  onClick: () => { navigator.clipboard.writeText(myPublicJWK()); alert('Скопировано!'); },
                  class: 'px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition'
                }, 'КОПИРОВАТЬ КЛЮЧ'),
                h('div', { class: 'w-full h-px bg-[#1b2533] my-2' }),
                h('h4', { class: 'text-xs font-bold text-white uppercase tracking-wider text-center' }, 'Вставить ключ собеседника'),
                h('textarea', {
                  placeholder: 'Вставьте публичный ключ собеседника сюда...',
                  class: 'w-full bg-[#05070a] text-xs text-white p-3 rounded-xl border border-[#1b2533] focus:outline-none focus:border-emerald-500 resize-none h-24',
                  onChange: async (e) => {
                    const key = e.target.value.trim();
                    if (key.length > 50 && activePartner()) {
                      try {
                        JSON.parse(atob(key));
                        await saveSecureKey(`trusted_key_${activePartner().id}`, key);
                        setPeerKeys(prev => ({ ...prev, [activePartner().id]: key }));
                        alert('Ключ импортирован!');
                        setOobModalOpen(false);
                      } catch (err) {}
                    }
                  }
                })
              )
            ),
            h(Show, { when: oobTab() === 'stego' },
              h('div', { class: 'space-y-5' },
                h('p', { class: 'text-[11px] text-[#738294] leading-relaxed text-center' },
                  'Спрячьте ключ внутри пикселей PNG. ВК/сервер видит только картинку, собеседник извлекает ключ.'
                ),
                h('div', { class: 'bg-[#05070a] p-4 rounded-2xl border border-[#1b2533] space-y-3.5' },
                  h('h4', { class: 'text-xs font-bold text-emerald-400 uppercase tracking-wider' }, '1. Спрятать ключ в картинку'),
                  h('input', { type: 'file', onChange: e => { const f = e.target.files[0]; if(f){const r=new FileReader();r.onload=ev=>setStegoBaseImg(ev.target.result);r.readAsDataURL(f);} }, class: 'block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/15 cursor-pointer', accept: 'image/*' }),
                  h('input', { type: 'text', placeholder: 'Seed (необязательно)', value: stegoCustomSeed(), onInput: e => setStegoCustomSeed(e.target.value), class: 'w-full bg-[#0b0e14] text-xs text-white p-2.5 rounded-xl border border-[#1b2533] focus:outline-none focus:border-emerald-500' }),
                  h('button', { onClick: runStegoEncryption, class: 'w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-950/20' }, 'ОБРАБОТАТЬ И ЗАШИФРОВАТЬ'),
                  h(Show, { when: generatedStegoUrl() },
                    h('div', { class: 'pt-2 text-center space-y-2 animate-slide-up' },
                      h('span', { class: 'text-[10px] text-[#738294] block' }, 'Стегоконтейнер готов:'),
                      h('img', { src: generatedStegoUrl(), class: 'mx-auto rounded-xl border border-white/5 max-h-40 object-contain shadow-2xl' }),
                      h('a', { href: generatedStegoUrl(), download: 'stego_secure_identity.png', class: 'inline-block px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] rounded-lg transition' }, 'СКАЧАТЬ PNG')
                    )
                  )
                ),
                h('div', { class: 'bg-[#05070a] p-4 rounded-2xl border border-[#1b2533] space-y-3.5' },
                  h('h4', { class: 'text-xs font-bold text-sky-400 uppercase tracking-wider' }, '2. Достать ключ из стего-картинки'),
                  h('input', { type: 'file', onChange: e => { const f = e.target.files[0]; if(f){const r=new FileReader();r.onload=ev=>setStegoExtractImg(ev.target.result);r.readAsDataURL(f);} }, class: 'block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/15 cursor-pointer', accept: 'image/*' }),
                  h('input', { type: 'text', placeholder: 'Seed (необязательно)', value: stegoExtractSeed(), onInput: e => setStegoExtractSeed(e.target.value), class: 'w-full bg-[#0b0e14] text-xs text-white p-2.5 rounded-xl border border-[#1b2533] focus:outline-none focus:border-sky-500' }),
                  h('button', { onClick: runStegoDecryption, class: 'w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-sky-950/20' }, 'ИЗВЛЕЧЬ И ДОВЕРЯТЬ КЛЮЧУ')
                ),
                h('p', { class: 'text-[10px] text-rose-400 bg-rose-950/10 border border-rose-900/20 p-3 rounded-xl leading-relaxed text-center' },
                  '⚠️ Пересылать стего-изображения строго как файл (без сжатия)! Иначе алгоритмы пережмут и разрушат скрытые байты ключа!'
                )
              )
            )
          )
        )
      )
    ),

    // DRAWER
    h(Show, { when: drawerOpen() },
      h('div', { class: 'absolute inset-0 bg-black/75 z-50 flex' },
        h('div', { class: 'w-[80%] max-w-[300px] bg-[#0e141c] h-full flex flex-col border-r border-[#1c2a3d] shadow-2xl relative animate-slide-right' },
          h('div', { class: 'bg-[#121b26] p-5 space-y-3.5 border-b border-[#1c2a3d]' },
            h('div', { class: 'w-16 h-16 rounded-full overflow-hidden bg-sky-950 border-2 border-sky-500/25' },
              h('img', { src: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName() || 'User') + '&background=0ea5e9&color=fff', class: 'w-full h-full object-cover' })
            ),
            h('div', null,
              h('h3', { class: 'font-bold text-white text-sm truncate' }, displayName() || 'Пользователь'),
              h('p', { class: 'text-xs text-emerald-400 font-semibold truncate mt-0.5' }, user()?.email)
            )
          ),
          h('div', { class: 'flex-1 py-4 overflow-y-auto space-y-1' },
            h('div', { onClick: () => { setDrawerOpen(false); setSettingsOpen(true); }, class: 'flex items-center gap-4 px-5 py-3.5 text-gray-300 text-xs font-semibold hover:bg-white/5 active:bg-white/10 cursor-pointer transition' }, h(Icons.Settings), 'Настройки профиля'),
            h('div', { onClick: () => { if(myPublicJWK()){const dl=document.createElement('a');dl.href='data:text/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(myPublicJWK()));dl.download='pub_identity.json';dl.click();} }, class: 'flex items-center gap-4 px-5 py-3.5 text-gray-300 text-xs font-semibold hover:bg-white/5 active:bg-white/10 cursor-pointer transition' }, h(Icons.Key), 'Резервная копия ключей'),
            h('div', { onClick: handleLogout, class: 'flex items-center gap-4 px-5 py-3.5 text-rose-400 text-xs font-semibold hover:bg-rose-950/20 active:bg-rose-950/30 cursor-pointer transition border-t border-[#1b2533]/40' }, h(Icons.Logout), 'Выйти из аккаунта')
          ),
          h('div', { class: 'p-4 border-t border-[#1b2533]/80 text-center text-[10px] text-gray-500 font-medium' }, 'VKTG Firebase v4.0 PFS')
        ),
        h('div', { onClick: () => setDrawerOpen(false), class: 'flex-1 h-full' })
      )
    ),

    // SETTINGS MODAL
    h(Show, { when: settingsOpen() },
      h('div', { class: 'absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm' },
        h('div', { class: 'bg-[#0e141c] w-full max-w-sm rounded-2xl p-5 border border-[#1b2533] space-y-4 max-h-[90vh] overflow-y-auto' },
          h('div', { class: 'flex items-center justify-between border-b border-[#1b2533] pb-2' },
            h('h3', { class: 'font-bold text-white text-sm' }, 'Профиль'),
            h('button', { onClick: () => setSettingsOpen(false), class: 'text-gray-400 p-1' }, h(Icons.Close))
          ),
          h('div', { class: 'space-y-3' },
            h('div', null,
              h('label', { class: 'block text-[10px] text-gray-400 mb-1.5 font-bold uppercase tracking-wider' }, 'Никнейм'),
              h('input', { type: 'text', value: displayName(), onInput: e => setDisplayName(e.target.value), class: 'w-full bg-[#05070a] text-xs text-white p-3 rounded-xl border border-[#1b2533] focus:outline-none' })
            ),
            h('button', { onClick: handleSaveProfile, class: 'w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition mt-2' }, 'СОХРАНИТЬ ИЗМЕНЕНИЯ')
          )
        )
      )
    ),

    // NEW CHAT MODAL
    h(Show, { when: newChatModal() },
      h('div', { class: 'absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm' },
        h('div', { class: 'bg-[#0e141c] w-full max-w-sm rounded-2xl p-5 border border-[#1b2533] space-y-4' },
          h('div', { class: 'flex items-center justify-between border-b border-[#1b2533] pb-2' },
            h('h3', { class: 'font-bold text-white text-sm' }, 'Новый чат E2EE'),
            h('button', { onClick: () => setNewChatModal(false), class: 'text-gray-400 p-1' }, h(Icons.Close))
          ),
          h('p', { class: 'text-[11px] text-[#738294] leading-relaxed' }, 'Введите email собеседника, чтобы открыть зашифрованный чат.'),
          h('button', { onClick: handleStartNewChat, class: 'w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition' }, 'НАЙТИ И ОТКРЫТЬ ЧАТ'),
          h('button', { onClick: () => setNewChatModal(false), class: 'w-full py-2 text-gray-400 text-xs hover:bg-white/5 rounded-lg transition' }, 'Отмена')
        )
      )
    ),

    // SAFETY NUMBER MODAL
    h(Show, { when: safetyNumberModal() && activePartner() },
      h('div', { class: 'absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm' },
        h('div', { class: 'bg-[#0e141c] w-full max-w-sm rounded-2xl p-5 border border-emerald-950 text-center space-y-4' },
          h('div', { class: 'flex justify-between items-center pb-2 border-b border-[#1b2533]' },
            h('span', { class: 'text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase' }, h(Icons.Lock, { className: 'w-3.5 h-3.5' }), 'ВЕРИФИКАЦИЯ КАНАЛА'),
            h('button', { onClick: () => setSafetyNumberModal(false), class: 'text-gray-400 p-1' }, h(Icons.Close))
          ),
          h('p', { class: 'text-[11px] text-[#738294] leading-relaxed' }, 'Сравните эти 60 чисел с числами на экране собеседника:'),
          h('div', { class: 'bg-[#05070a] p-4 rounded-xl border border-[#1b2533] font-mono text-xs text-emerald-400 tracking-widest break-words leading-relaxed select-all' }, safetyNumber()),
          h('div', { class: 'text-[9px] text-gray-500 leading-relaxed' }, 'ECDH P-256 + HMAC-SHA256 + AES-GCM 256')
        )
      )
    ),

    // ATTACHMENT SHEET
    h(Show, { when: attachmentSheet() },
      h('div', { class: 'absolute inset-0 bg-black/75 z-50 flex flex-col justify-end' },
        h('div', { onClick: () => setAttachmentSheet(false), class: 'flex-1 w-full' }),
        h('div', { class: 'bg-[#0e141c] rounded-t-3xl p-5 space-y-4 border-t border-[#1b2533] shadow-2xl relative animate-slide-up' },
          h('div', { class: 'w-12 h-1 bg-white/10 rounded-full mx-auto mb-1' }),
          h('h4', { class: 'text-xs font-bold text-white uppercase tracking-wider text-center' }, 'Шифрованная отправка E2EE'),
          h('div', { class: 'grid grid-cols-2 gap-4 pt-2' },
            h('label', { class: 'flex flex-col items-center justify-center p-4 bg-[#05070a] hover:bg-[#121822] rounded-xl cursor-pointer border border-[#1b2533] space-y-1.5 transition' },
              h('span', { class: 'text-emerald-400' }, h(Icons.Edit)),
              h('span', { class: 'text-[10px] text-white font-semibold' }, 'Галерея / Файлы'),
              h('input', { type: 'file', onChange: handleFileSelection, class: 'hidden' })
            ),
            h('div', { onClick: () => { setAttachmentSheet(false); startCircleRecording(); }, class: 'flex flex-col items-center justify-center p-4 bg-[#05070a] hover:bg-[#121822] rounded-xl cursor-pointer border border-[#1b2533] space-y-1.5 transition text-center' },
              h(Icons.CircleVideo),
              h('span', { class: 'text-[10px] text-white font-semibold' }, 'Записать кружочек')
            )
          ),
          h('button', { onClick: () => setAttachmentSheet(false), class: 'w-full py-3 bg-[#1b2533] hover:bg-[#28384d] text-white text-xs font-bold rounded-xl transition' }, 'ОТМЕНА')
        )
      )
    )

  );
}

// Mount
const root = document.getElementById('root');
SolidDOM.render(App, root);
