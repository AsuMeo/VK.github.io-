// ================= SOLIDJS UMD IMPORTS =================
const { createSignal, createEffect, onCleanup, createMemo, Show, For, batch } = Solid;
const { render } = SolidDOM;

// ================= SVG ICONS =================
const Icons = {
  Menu: () => h('svg', { class: 'w-6 h-6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M4 6h16M4 12h16M4 18h16' })),
  Search: () => h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' })),
  Lock: (props) => h('svg', { class: props.className || 'w-4 h-4', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' })),
  LockOpen: (props) => h('svg', { class: props.className || 'w-4 h-4', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z' })),
  Send: () => h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z' })),
  Attach: () => h('svg', { class: 'w-5 h-5 text-gray-400 hover:text-white transition', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13' })),
  Sync: () => h('svg', { class: 'w-5 h-5 text-sky-400', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17' })),
  Back: () => h('svg', { class: 'w-6 h-6 text-white', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M10 19l-7-7m0 0l7-7m-7 7h18' })),
  Settings: () => h('svg', { class: 'w-5 h-5 text-gray-400', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' })),
  Key: () => h('svg', { class: 'w-5 h-5 text-gray-400', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15 7a2 2 0 012 2m-2.293 2.293a1 1 0 01-1.414 0l-1.414-1.414a1 1 0 010-1.414zM11 11a4 4 0 11-7.293-2.293 1 1 0 011.414 1.414L6.5 11.5M11 11h9a2 2 0 002-2V7a2 2 0 00-2-2h-3l-2.5 2.5L13 5' })),
  Logout: () => h('svg', { class: 'w-5 h-5 text-red-400', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' })),
  Close: () => h('svg', { class: 'w-5 h-5 text-gray-400 hover:text-white', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })),
  Edit: () => h('svg', { class: 'w-6 h-6', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' })),
  Qr: () => h('svg', { class: 'w-5 h-5 text-emerald-400', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('rect', { x: '3', y: '3', width: '6', height: '6', rx: '1' }),
    h('rect', { x: '15', y: '3', width: '6', height: '6', rx: '1' }),
    h('rect', { x: '3', y: '15', width: '6', height: '6', rx: '1' }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M14 14h2v2h-2zm2 2h2v2h-2zm-2 2h2v-2h-2zm6-4h-2v2h2zm-2 2h2v2h-2zm2-4v-2h-2v2z' })),
  Mic: () => h('svg', { class: 'w-5 h-5 text-sky-400 hover:text-sky-300', fill: 'currentColor', viewBox: '0 0 20 20' },
    h('path', { 'fill-rule': 'evenodd', d: 'M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 005.93 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z', 'clip-rule': 'evenodd' })),
  CircleVideo: () => h('svg', { class: 'w-5 h-5 text-emerald-400 hover:text-emerald-300', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' })),
  User: () => h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }))
};

// ================= HYPERSCRIPT HELPER (JSX replacement for UMD) =================
function h(tag, props, ...children) {
  if (typeof tag === 'function') return tag({ ...props, children });
  const el = document.createElement(tag);
  if (props) {
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'class') el.className = v;
      else if (k === 'ref' && typeof v === 'function') v(el);
      else if (k.startsWith('on') && typeof v === 'function') {
        const event = k.slice(2).toLowerCase();
        el.addEventListener(event, v);
      }
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dangerouslySetInnerHTML') el.innerHTML = v.__html;
      else el.setAttribute(k, v);
    });
  }
  children.flat().forEach(c => {
    if (c == null) return;
    if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(c));
    else if (c instanceof Node) el.appendChild(c);
  });
  return el;
}

// ================= TIMESTAMP FORMATTER =================
function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(typeof ts === 'number' ? ts : ts * 1000);
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

// ================= DECRYPTED MEDIA VIEWER COMPONENT =================
function DecryptedMediaViewer(props) {
  const [localUrl, setLocalUrl] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);

  createEffect(() => {
    let isMounted = true;
    let blobUrl = null;
    async function decrypt() {
      if (!props.docUrl || !props.peerKeyB64 || !props.privKeyObj) { setLoading(false); return; }
      try {
        const resp = await fetch(props.docUrl);
        const base64Text = await resp.text();
        const decryptedBytes = await decryptDataPFS(
          props.peerKeyB64, props.iv, base64Text,
          parseInt(props.sequence), props.myId, props.partnerId, props.privKeyObj
        );
        let finalMime = props.mime;
        if (props.name.endsWith('.mur')) finalMime = 'image/png';
        else if (props.name.endsWith('.meow')) finalMime = 'video/mp4';
        else if (props.name.endsWith('.meo')) finalMime = 'audio/webm';
        else if (props.name.endsWith('.me')) finalMime = 'video/webm';
        const blob = new Blob([decryptedBytes], { type: finalMime });
        blobUrl = URL.createObjectURL(blob);
        if (isMounted) { setLocalUrl(blobUrl); setLoading(false); }
      } catch (e) {
        if (isMounted) { setError(true); setLoading(false); }
      }
    }
    decrypt();
    onCleanup(() => { isMounted = false; if (blobUrl) URL.revokeObjectURL(blobUrl); });
  });

  return h(Show, { when: !loading(), fallback:
    h('div', { class: 'flex items-center gap-2.5 p-3.5 bg-[#05070a]/40 rounded-xl border border-white/5 animate-pulse text-xs text-sky-400' },
      h('span', { class: 'w-4.5 h-4.5 rounded-full border-2 border-t-transparent border-sky-400 animate-spin' }),
      h('span', null, 'Расшифровка секретного медиа...')
    )
  },
    h(Show, { when: !error() && localUrl(), fallback:
      h('div', { class: 'p-3 bg-rose-950/20 border border-rose-900/30 rounded-xl text-xs text-rose-400 font-bold' },
        '🔒 Ошибка сквозного расшифрования файла.'
      )
    },
      () => {
        const url = localUrl();
        const name = props.name;
        if (name.endsWith('.mur') || props.mime.startsWith('image/')) {
          return h('div', { class: 'rounded-xl overflow-hidden border border-white/5 shadow-inner' },
            h('img', { src: url, class: 'max-w-full rounded-xl max-h-72 object-cover cursor-pointer hover:opacity-90 transition',
              onClick: () => window.open(url, '_blank') })
          );
        }
        if (name.endsWith('.meow') || (props.mime.startsWith('video/') && !name.endsWith('.me'))) {
          return h('div', { class: 'rounded-xl overflow-hidden border border-white/5 bg-black' },
            h('video', { src: url, controls: true, class: 'w-full rounded-xl max-h-72' })
          );
        }
        if (name.endsWith('.meo') || props.mime.startsWith('audio/')) {
          return h('div', { class: 'flex items-center gap-3 bg-slate-900/40 p-3 rounded-2xl border border-sky-500/10 max-w-full' },
            h('div', { class: 'w-9 h-9 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0' },
              h(Icons.Mic)
            ),
            h('audio', { src: url, controls: true, class: 'flex-1 h-8 rounded-lg text-xs' })
          );
        }
        if (name.endsWith('.me')) {
          return h('div', { class: 'flex justify-center p-1.5' },
            h('div', { class: 'relative w-40 h-40 rounded-full overflow-hidden border-2 border-emerald-500 bg-black shadow-lg' },
              h('video', { src: url, loop: true, autoPlay: true, muted: true, playsInline: true,
                class: 'w-full h-full object-cover rounded-full cursor-pointer',
                onClick: (e) => { if (e.target.paused) e.target.play(); else e.target.pause(); } })
            )
          );
        }
        return h('div', { class: 'p-3 bg-black/20 rounded-xl border border-white/5 flex items-center justify-between gap-4' },
          h('div', { class: 'flex items-center gap-2.5 min-w-0' },
            h('svg', { class: 'w-6 h-6 text-sky-400 shrink-0', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', viewBox: '0 0 24 24' },
              h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })),
            h('div', { class: 'min-w-0' },
              h('p', { class: 'text-[11px] font-bold truncate text-white' }, name),
              h('p', { class: 'text-[9px] text-[#738294] truncate' }, props.mime)
            )
          ),
          h('a', { href: url, download: name, class: 'px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-[10px] font-bold rounded-lg transition shrink-0 uppercase tracking-wider text-white' }, 'Скачать')
        );
      }
    )
  );
}
