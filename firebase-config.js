// ================= FIREBASE CONFIG & AUTH =================
// ЗАМЕНИТЕ НА СВОИ КРЕДЫ ИЗ КОНСОЛИ FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBm0mIvHVznIeF2PoFk6dtdaiT5r877wyA",
  authDomain: "meow-874ce.firebaseapp.com",
  databaseURL: "https://meow-874ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "meow-874ce",
  storageBucket: "meow-874ce.firebasestorage.app",
  messagingSenderId: "471541334599",
  appId: "1:471541334599:web:567af3e7dbe70a37572762"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// ================= AUTH HELPERS =================
function fbRegister(email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
}
function fbLogin(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}
function fbLogout() {
  return auth.signOut();
}
function fbCurrentUser() {
  return auth.currentUser;
}
function fbOnAuth(callback) {
  return auth.onAuthStateChanged(callback);
}

// ================= REALTIME DATABASE HELPERS =================
// Users
function fbUserRef(uid) {
  return db.ref(`users/${uid}`);
}
function fbSetUserProfile(uid, data) {
  return fbUserRef(uid).set(data);
}
function fbGetUserProfile(uid) {
  return fbUserRef(uid).once('value').then(s => s.val());
}
function fbUpdateUserProfile(uid, data) {
  return fbUserRef(uid).update(data);
}

// Conversations list per user
function fbConversationsRef(uid) {
  return db.ref(`conversations/${uid}`);
}
function fbOnConversations(uid, callback) {
  return fbConversationsRef(uid).on('value', snap => {
    const val = snap.val() || {};
    callback(Object.entries(val).map(([id, data]) => ({ id: parseInt(id), ...data })));
  });
}
function fbOffConversations(uid) {
  return fbConversationsRef(uid).off();
}

// Messages in a conversation
function fbMessagesRef(myUid, partnerUid) {
  // Consistent room ID: sorted uids joined by underscore
  const roomId = [myUid, partnerUid].sort().join('_');
  return db.ref(`messages/${roomId}`);
}
function fbSendMessage(myUid, partnerUid, payload) {
  const ref = fbMessagesRef(myUid, partnerUid).push();
  return ref.set({
    ...payload,
    senderId: myUid,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    id: ref.key
  });
}
function fbOnMessages(myUid, partnerUid, callback) {
  return fbMessagesRef(myUid, partnerUid).on('value', snap => {
    const val = snap.val() || {};
    const msgs = Object.values(val).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    callback(msgs);
  });
}
function fbOffMessages(myUid, partnerUid) {
  return fbMessagesRef(myUid, partnerUid).off();
}

// Public keys exchange
function fbPublicKeyRef(uid) {
  return db.ref(`publicKeys/${uid}`);
}
function fbSetPublicKey(uid, pubKeyB64) {
  return fbPublicKeyRef(uid).set(pubKeyB64);
}
function fbGetPublicKey(uid) {
  return fbPublicKeyRef(uid).once('value').then(s => s.val());
}
function fbOnPublicKey(uid, callback) {
  return fbPublicKeyRef(uid).on('value', snap => callback(snap.val()));
}

// Typing indicators
function fbTypingRef(myUid, partnerUid) {
  const roomId = [myUid, partnerUid].sort().join('_');
  return db.ref(`typing/${roomId}/${myUid}`);
}
function fbSetTyping(myUid, partnerUid, isTyping) {
  return fbTypingRef(myUid, partnerUid).set(isTyping ? Date.now() : null);
}
function fbOnPartnerTyping(myUid, partnerUid, callback) {
  const roomId = [myUid, partnerUid].sort().join('_');
  return db.ref(`typing/${roomId}/${partnerUid}`).on('value', snap => {
    const val = snap.val();
    callback(val && (Date.now() - val) < 5000);
  });
}

// Online status
function fbSetOnline(uid) {
  const connRef = db.ref('.info/connected');
  const myStatusRef = db.ref(`status/${uid}`);
  connRef.on('value', snap => {
    if (snap.val() === true) {
      myStatusRef.onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
      myStatusRef.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
  });
}
function fbOnUserStatus(uid, callback) {
  return db.ref(`status/${uid}`).on('value', snap => callback(snap.val() || { online: false }));
}
