'use strict';
/* Zalo Lite - giao diện web (PWA) cho iPhone. Không dùng thư viện ngoài. */
(() => {
  const $app = document.getElementById('app');
  const INLINE_IMG = /^image\/(png|jpeg|gif|webp)$/;

  /* ------------------------------------------------------------------ */
  /* Tiện ích                                                            */
  /* ------------------------------------------------------------------ */
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    clip: '<path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>',
    micOff: '<path d="M1 1l22 22"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V4a3 3 0 0 0-5.9-.8"/><path d="M17 16.9A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.1 1.1M12 19v4M8 23h8"/>',
    videoOff: '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.7 0H14a2 2 0 0 1 2 2v3.3l1 1L23 7v10"/><path d="M1 1l22 22"/>',
    flip: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    chats: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
  };
  function ico(name) {
    const t = document.createElement('template');
    t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
    return t.content.firstChild;
  }
  // Tạo phần tử DOM an toàn (luôn dùng textContent, không dùng innerHTML cho dữ liệu người dùng)
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const iconBtn = (name, label, onclick, cls = '') => h('button', { class: 'icon-btn ' + cls, 'aria-label': label, onclick }, ico(name));

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  const pad = n => String(n).padStart(2, '0');
  const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  function fmtDay(ts) {
    const d = new Date(ts), today = Date.now();
    if (sameDay(ts, today)) return 'Hôm nay';
    if (sameDay(ts, today - 86400000)) return 'Hôm qua';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  function fmtListTime(ts) {
    if (sameDay(ts, Date.now())) return fmtTime(ts);
    const d = new Date(ts);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }
  const fmtDur = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const initial = name => ((String(name || '?').trim().split(/\s+/).pop() || '?')[0] || '?').toUpperCase();

  function avatar(name, color, cls = '', online = false) {
    return h('div', { class: 'avatar ' + cls, style: `background:${color || '#0068ff'}` }, initial(name), online ? h('i', { class: 'dot' }) : null);
  }

  /* ------------------------------------------------------------------ */
  /* Trạng thái                                                          */
  /* ------------------------------------------------------------------ */
  const S = {
    token: LS.get('token'), me: null,
    convs: new Map(), msgs: new Map(), hasMore: new Map(), users: new Map(),
    online: new Set(), typing: new Map(),
    tab: 'chats', cur: null,
    ws: null, wsOk: false, retry: 0, pending: [],
    call: null, ice: [{ urls: 'stun:stun.l.google.com:19302' }],
  };
  const myId = () => S.me && S.me.id;
  const regUsers = list => (list || []).forEach(u => S.users.set(u.id, u));

  async function api(path, { method = 'GET', body, raw = false, headers = {} } = {}) {
    const h2 = { ...headers };
    if (S.token) h2.Authorization = 'Bearer ' + S.token;
    if (body !== undefined && !raw) h2['Content-Type'] = 'application/json';
    const res = await fetch(path, { method, headers: h2, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch { /* không phải JSON */ }
    if (res.status === 401 && S.token && !/^\/api\/(login|register)/.test(path)) { forceLogout(); throw new Error('Phiên đăng nhập đã hết hạn'); }
    if (!res.ok) throw new Error((data && data.error) || 'Lỗi ' + res.status);
    return data;
  }

  /* ------------------------------------------------------------------ */
  /* Đăng nhập / đăng ký                                                 */
  /* ------------------------------------------------------------------ */
  function renderAuth(mode = 'login') {
    const reg = mode === 'register';
    const err = h('p', { class: 'error' });
    const user = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'vd: minh.nguyen hoặc 0912345678' });
    const name = h('input', { type: 'text', autocomplete: 'name', placeholder: 'vd: Nguyễn Minh' });
    const pass = h('input', { type: 'password', autocomplete: reg ? 'new-password' : 'current-password', placeholder: 'Tối thiểu 6 ký tự' });
    const btn = h('button', { class: 'btn', type: 'submit' }, reg ? 'Tạo tài khoản' : 'Đăng nhập');
    const form = h('form', {
      onsubmit: async e => {
        e.preventDefault();
        err.textContent = ''; btn.disabled = true;
        try {
          const r = await api(reg ? '/api/register' : '/api/login', { method: 'POST', body: { username: user.value, name: name.value, password: pass.value } });
          S.token = r.token; LS.set('token', r.token);
          await boot();
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
      },
    },
    h('label', { class: 'field' }, h('span', { text: 'Tên đăng nhập / số điện thoại' }), user),
    reg ? h('label', { class: 'field' }, h('span', { text: 'Tên hiển thị' }), name) : null,
    h('label', { class: 'field' }, h('span', { text: 'Mật khẩu' }), pass),
    err, btn);
    $app.replaceChildren(h('div', { class: 'auth' },
      h('div', { class: 'logo' }, h('b', { text: 'Zalo Lite' }), h('span', { text: 'Nhắn tin · Gọi điện · Video call' })),
      h('div', { class: 'card' }, form,
        h('div', { class: 'switch' }, reg ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? ',
          h('button', { class: 'link', type: 'button', onclick: () => renderAuth(reg ? 'login' : 'register') }, reg ? 'Đăng nhập' : 'Đăng ký')))));
  }

  function forceLogout() {
    LS.del('token');
    S.token = null; S.me = null; S.cur = null;
    if (S.call) endCall('local', true);
    if (S.ws) { const w = S.ws; S.ws = null; try { w.close(); } catch { /* ignore */ } }
    S.convs.clear(); S.msgs.clear(); S.pending = []; S.wsOk = false;
    renderAuth();
  }
  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
    forceLogout();
  }

  /* ------------------------------------------------------------------ */
  /* Khởi động                                                           */
  /* ------------------------------------------------------------------ */
  async function boot() {
    try {
      const { user } = await api('/api/me');
      S.me = user; regUsers([user]);
      await loadConvs();
      api('/api/ice').then(r => { S.ice = r.iceServers; }).catch(() => {});
      connect();
      render();
    } catch (e) {
      if (!S.token) return;
      $app.replaceChildren(h('div', { class: 'empty', style: 'margin:auto' },
        h('p', { text: 'Không kết nối được máy chủ.' }),
        h('button', { class: 'btn', style: 'max-width:220px;margin:12px auto 0', onclick: () => boot() }, 'Thử lại')));
    }
  }

  async function loadConvs() {
    const { conversations } = await api('/api/conversations');
    for (const c of conversations) upsertConv(c);
  }
  function upsertConv(c) {
    regUsers(c.members);
    const old = S.convs.get(c.id);
    S.convs.set(c.id, c);
    // giữ unread = 0 nếu đang mở đúng hội thoại này
    if (S.cur === c.id && old) c.unread = 0;
  }
  const convOf = id => S.convs.get(id);
  const directConvWith = peerId => [...S.convs.values()].find(c => c.type === 'direct' && c.peer === peerId);

  /* ------------------------------------------------------------------ */
  /* WebSocket                                                           */
  /* ------------------------------------------------------------------ */
  let pongTimer = null;
  function connect() {
    if (!S.token) return;
    if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(S.token)}`);
    S.ws = ws;
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onWs(m); };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      S.wsOk = false; updateConn();
      const wait = Math.min(15000, 800 * 2 ** Math.min(S.retry++, 5));
      setTimeout(connect, wait);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }
  function wsSend(obj) {
    if (S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(obj)); return true; }
    return false;
  }
  function checkAlive() { // iOS hay treo socket khi app ở nền: kiểm tra khi quay lại
    if (!S.token) return;
    if (!S.ws || S.ws.readyState > 1) { S.retry = 0; connect(); return; }
    if (S.ws.readyState !== 1) return;
    wsSend({ t: 'ping' });
    clearTimeout(pongTimer);
    pongTimer = setTimeout(() => { try { S.ws.close(); } catch { /* ignore */ } }, 4000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkAlive();
    if (S.cur) markRead(S.cur);
  });
  window.addEventListener('online', () => { S.retry = 0; checkAlive(); });
  setInterval(() => { if (document.visibilityState === 'visible') checkAlive(); }, 30000);

  async function onWs(m) {
    switch (m.t) {
      case 'hello':
        S.wsOk = true; S.retry = 0; S.online = new Set(m.online);
        updateConn();
        try { await loadConvs(); } catch { /* ignore */ }
        if (S.cur) { await syncCur(); markRead(S.cur); }
        for (const p of S.pending) sendPending(p);
        render(true);
        break;
      case 'pong': clearTimeout(pongTimer); break;
      case 'presence':
        if (m.online) S.online.add(m.user); else S.online.delete(m.user);
        refreshPresence();
        break;
      case 'conv': upsertConv(m.c); if (!S.cur) render(true); else if (S.cur === m.c.id) updateChatHeader(); break;
      case 'msg': onMsg(m.m); break;
      case 'ack': {
        const i = S.pending.findIndex(p => p.cid === m.cid);
        if (i >= 0) S.pending.splice(i, 1);
        onMsg(m.m);
        break;
      }
      case 'typing': onTyping(m); break;
      case 'read': {
        const c = convOf(m.conv);
        if (c) { c.lastRead = { ...c.lastRead, [m.user]: m.upTo }; if (S.cur === m.conv) updateMsgs(); }
        break;
      }
      case 'call': onCallSignal(m); break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tin nhắn                                                            */
  /* ------------------------------------------------------------------ */
  function onMsg(m) {
    if (m.cid) { const i = S.pending.findIndex(p => p.cid === m.cid); if (i >= 0) S.pending.splice(i, 1); }
    const c = convOf(m.conv);
    if (!c) { loadConvs().then(() => { if (convOf(m.conv)) onMsg(m); }).catch(() => {}); return; }
    const arr = S.msgs.get(m.conv);
    if (arr) {
      if (!arr.some(x => x.id === m.id)) {
        const last = arr[arr.length - 1];
        if (last && m.seq > last.seq + 1) syncConv(m.conv); // lỡ tin -> kéo bù
        arr.push(m);
        arr.sort((a, b) => a.seq - b.seq);
      }
    }
    if (!c.last || m.seq >= c.last.seq) c.last = m;
    c.seq = Math.max(c.seq, m.seq);
    const mine = m.from === myId();
    if (!mine) {
      const viewing = S.cur === m.conv && document.visibilityState === 'visible';
      if (viewing) markRead(m.conv);
      else {
        c.unread = (c.unread || 0) + 1;
        if (!S.call && m.kind !== 'call') toast(`${c.name}: ${previewText(m, c, true)}`);
      }
    } else {
      c.lastRead = { ...c.lastRead, [myId()]: c.seq };
    }
    if (S.cur === m.conv) updateMsgs(mine);
    if (!S.cur) render(true);
    updateBadge();
  }

  async function syncConv(id) {
    const arr = S.msgs.get(id);
    if (!arr) return;
    const after = arr.length ? arr[arr.length - 1].seq : 0;
    try {
      const { messages } = await api(`/api/messages?conv=${encodeURIComponent(id)}&after=${after}`);
      for (const m of messages) if (!arr.some(x => x.id === m.id)) arr.push(m);
      arr.sort((a, b) => a.seq - b.seq);
      const c = convOf(id);
      if (c && arr.length) { c.last = arr[arr.length - 1]; c.seq = Math.max(c.seq, c.last.seq); }
      if (S.cur === id) updateMsgs();
    } catch { /* ignore */ }
  }
  const syncCur = () => (S.cur && S.msgs.has(S.cur) ? syncConv(S.cur) : Promise.resolve());

  async function loadMessages(id) {
    try {
      const { messages, hasMore } = await api(`/api/messages?conv=${encodeURIComponent(id)}&limit=50`);
      S.msgs.set(id, messages); S.hasMore.set(id, hasMore);
      if (S.cur === id) { updateMsgs(true); markRead(id); }
    } catch (e) { toast(e.message); }
  }
  async function loadOlder() {
    const id = S.cur, arr = S.msgs.get(id);
    if (!arr || !arr.length) return;
    const box = document.getElementById('msgs');
    const prevH = box.scrollHeight, prevTop = box.scrollTop;
    try {
      const { messages, hasMore } = await api(`/api/messages?conv=${encodeURIComponent(id)}&before=${arr[0].seq}&limit=50`);
      arr.unshift(...messages); S.hasMore.set(id, hasMore);
      updateMsgs(false);
      box.scrollTop = box.scrollHeight - prevH + prevTop;
    } catch (e) { toast(e.message); }
  }

  function markRead(id) {
    const c = convOf(id);
    if (!c || !S.msgs.has(id)) return;
    const mineRead = (c.lastRead && c.lastRead[myId()]) || 0;
    if (c.seq > mineRead) {
      wsSend({ t: 'read', conv: id, upTo: c.seq });
      c.lastRead = { ...c.lastRead, [myId()]: c.seq };
    }
    if (c.unread) { c.unread = 0; updateBadge(); }
  }

  function queueMsg(conv, fields) {
    const p = { cid: rid(), conv, kind: 'text', text: '', file: null, t: Date.now(), ...fields };
    S.pending.push(p);
    sendPending(p);
    if (S.cur === conv) updateMsgs(true);
    return p;
  }
  function sendPending(p) {
    if (!wsSend({ t: 'msg', conv: p.conv, kind: p.kind, text: p.text, file: p.file ? p.file.id : undefined, cid: p.cid })) updateConn();
  }

  let lastTypingSent = 0;
  function onTyping(m) {
    if (S.cur !== m.conv) return;
    const key = m.conv + m.user;
    clearTimeout(S.typing.get(key));
    S.typing.set(key, setTimeout(() => { S.typing.delete(key); updateTyping(); }, 3500));
    updateTyping();
  }
  function updateTyping() {
    const el = document.getElementById('typing');
    if (!el) return;
    const c = convOf(S.cur);
    const who = [...S.typing.keys()].filter(k => k.startsWith(S.cur)).map(k => S.users.get(k.slice(S.cur.length)));
    if (!who.length || !c) { el.textContent = ''; return; }
    el.textContent = c.type === 'group' ? `${who.map(u => u && u.name.split(' ').pop()).join(', ')} đang soạn tin...` : 'đang soạn tin...';
  }

  function previewText(m, c, short) {
    if (!m) return 'Chưa có tin nhắn';
    let t;
    if (m.kind === 'image') t = '[Hình ảnh]';
    else if (m.kind === 'file') t = '[Tệp] ' + (m.file ? m.file.name : '');
    else if (m.kind === 'call') t = '[' + callInfo(m).text + ']';
    else t = m.text;
    t = t.replace(/\s+/g, ' ');
    if (short) return t;
    if (m.from === myId()) return 'Bạn: ' + t;
    if (c.type === 'group') { const u = S.users.get(m.from); return (u ? u.name.split(' ').pop() + ': ' : '') + t; }
    return t;
  }

  function callInfo(m) {
    let j = {};
    try { j = JSON.parse(m.text); } catch { /* ignore */ }
    const mine = m.from === myId();
    const kind = j.k === 'video' ? 'video' : 'thoại';
    switch (j.r) {
      case 'done': return { text: `Cuộc gọi ${kind} · ${fmtDur(j.d || 0)}`, miss: false };
      case 'reject': return { text: mine ? 'Người nhận đã từ chối' : 'Bạn đã từ chối', miss: mine };
      case 'busy': return { text: mine ? 'Người nhận đang bận' : 'Cuộc gọi nhỡ', miss: true };
      case 'cancel': return { text: mine ? 'Bạn đã hủy cuộc gọi' : 'Cuộc gọi nhỡ', miss: !mine };
      default: return { text: mine ? 'Không trả lời' : 'Cuộc gọi nhỡ', miss: true };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tệp & ảnh                                                           */
  /* ------------------------------------------------------------------ */
  const blobCache = new Map();
  function fileUrl(f) {
    if (!blobCache.has(f.id)) {
      const p = fetch('/files/' + f.id, { headers: { Authorization: 'Bearer ' + S.token } })
        .then(r => { if (!r.ok) throw new Error('lỗi tải tệp'); return r.blob(); })
        .then(b => URL.createObjectURL(new Blob([b], { type: f.mime })));
      p.catch(() => blobCache.delete(f.id));
      blobCache.set(f.id, p);
    }
    return blobCache.get(f.id);
  }
  async function saveFile(f) {
    try {
      const url = await fileUrl(f);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], f.name, { type: f.mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: f.name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const a = h('a', { href: url, download: f.name });
      document.body.append(a); a.click(); a.remove();
    } catch { toast('Không tải được tệp'); }
  }
  function openViewer(f) {
    const img = h('img', { alt: f.name });
    fileUrl(f).then(u => { img.src = u; });
    const v = h('div', { class: 'viewer', onclick: () => v.remove() }, img,
      h('button', { class: 'icon-btn close', 'aria-label': 'Đóng' }, ico('close')));
    document.body.append(v);
  }

  async function prepImage(file) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size < 800 * 1024 && /jpeg|png|webp/i.test(file.type)) return file;
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
      return blob ? new File([blob], (file.name || 'anh').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
    } catch { return file; }
  }
  async function sendFile(convId, picked) {
    let file = picked;
    if (file.type.startsWith('image/')) file = await prepImage(file);
    if (file.size > 25 * 1024 * 1024) { toast('Tệp tối đa 25 MB'); return; }
    toast('Đang gửi tệp...', 8000);
    try {
      const { file: f } = await api(`/api/upload?conv=${encodeURIComponent(convId)}&name=${encodeURIComponent(file.name || 'tep')}`,
        { method: 'POST', body: file, raw: true, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      queueMsg(convId, { kind: INLINE_IMG.test(f.mime) ? 'image' : 'file', file: f });
      toast('Đã gửi', 1200);
    } catch (e) { toast(e.message); }
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình chính                                                      */
  /* ------------------------------------------------------------------ */
  function render() {
    if (!S.token || !S.me) return renderAuth();
    if (S.cur && convOf(S.cur)) {
      if (!document.getElementById('msgs')) renderChat();
      else updateChatHeader();
    } else {
      S.cur = null;
      renderMain();
    }
    updateConn();
  }
  const connBar = () => h('div', { class: 'conn hidden', text: 'Đang kết nối lại...' });
  function updateConn() {
    document.querySelectorAll('.conn').forEach(el => el.classList.toggle('hidden', S.wsOk || !S.token));
  }
  function updateBadge() {
    const total = [...S.convs.values()].reduce((n, c) => n + (c.unread || 0), 0);
    document.title = total ? `(${total}) Zalo Lite` : 'Zalo Lite';
    try { if (navigator.setAppBadge) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {}); } catch { /* ignore */ }
    const b = document.getElementById('tabbadge');
    if (b) { b.textContent = total > 99 ? '99+' : String(total); b.classList.toggle('hidden', !total); }
  }

  function renderMain() {
    const chats = S.tab === 'chats';
    const top = h('div', { class: 'topbar' },
      h('h1', { text: chats ? 'Tin nhắn' : 'Cá nhân' }),
      chats ? iconBtn('plus', 'Tạo mới', openNewMenu) : null);
    const body = chats ? chatList() : profileView();
    const tab = (id, label, icon) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } },
      ico(icon), label, id === 'chats' ? h('span', { class: 'badge hidden', id: 'tabbadge' }) : null);
    $app.replaceChildren(top, connBar(), h('div', { class: 'screen' }, body),
      h('nav', { class: 'tabbar' }, tab('chats', 'Tin nhắn', 'chats'), tab('me', 'Cá nhân', 'user')));
    updateBadge(); updateConn();
  }

  function chatList() {
    const list = [...S.convs.values()].sort((a, b) => ((b.last ? b.last.t : b.createdAt) - (a.last ? a.last.t : a.createdAt)));
    if (!list.length) {
      return h('div', { class: 'list' }, h('div', { class: 'empty' },
        h('p', { text: 'Chưa có cuộc trò chuyện nào.' }),
        h('button', { class: 'btn', style: 'max-width:240px;margin:12px auto 0', onclick: () => openNewMenu() }, 'Bắt đầu trò chuyện')));
    }
    return h('div', { class: 'list' }, list.map(c => h('button', { class: 'row', onclick: () => openConv(c.id) },
      avatar(c.name, c.color, '', c.type === 'direct' && S.online.has(c.peer)),
      h('div', { class: 'mid' },
        h('b', {}, c.name, c.type === 'group' ? h('span', { class: 'tag', text: 'Nhóm' }) : null),
        h('small', { class: c.unread ? 'unread' : '', text: previewText(c.last, c) })),
      h('div', { class: 'end' },
        h('time', { text: c.last ? fmtListTime(c.last.t) : '' }),
        c.unread ? h('span', { class: 'badge', text: c.unread > 99 ? '99+' : String(c.unread) }) : null))));
  }

  function profileView() {
    const restoreInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) restoreBackup(f);
    } });
    return h('div', { class: 'profile' },
      h('div', { class: 'head' }, avatar(S.me.name, S.me.color), h('b', { text: S.me.name }), h('small', { text: '@' + S.me.username })),
      h('div', { class: 'section' },
        h('h3', { text: 'Sao lưu & đồng bộ' }),
        h('p', { text: 'Tin nhắn luôn được lưu trên máy chủ và đồng bộ khi bạn đăng nhập trên thiết bị khác. Bạn cũng có thể tải một bản sao lưu về máy (lưu vào Tệp/iCloud).' }),
        h('button', { class: 'btn', onclick: doBackup }, 'Sao lưu ngay'),
        h('button', { class: 'btn ghost', onclick: () => restoreInput.click() }, 'Khôi phục từ tệp sao lưu'),
        restoreInput),
      h('div', { class: 'section' },
        h('h3', { text: 'Tài khoản' }),
        h('button', { class: 'btn ghost', onclick: renameMe }, 'Đổi tên hiển thị'),
        h('button', { class: 'btn danger', onclick: logout }, 'Đăng xuất')));
  }

  async function renameMe() {
    const name = prompt('Tên hiển thị mới', S.me.name);
    if (!name || !name.trim()) return;
    try {
      const { user } = await api('/api/profile', { method: 'POST', body: { name } });
      S.me = user; regUsers([user]); render();
    } catch (e) { toast(e.message); }
  }

  async function doBackup() {
    try {
      toast('Đang tạo bản sao lưu...', 5000);
      const res = await fetch('/api/backup', { headers: { Authorization: 'Bearer ' + S.token } });
      if (!res.ok) throw new Error('Không tạo được bản sao lưu');
      const blob = await res.blob();
      const name = `zalo-lite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); toast('Đã sao lưu', 1500); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      toast('Đã tạo bản sao lưu', 1800);
    } catch (e) { toast(e.message); }
  }
  async function restoreBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      const r = await api('/api/restore', { method: 'POST', body: data });
      await loadConvs(); S.msgs.clear();
      toast(`Đã khôi phục ${r.restored} tin nhắn`, 3500);
      render();
    } catch (e) { toast(e instanceof SyntaxError ? 'Tệp không hợp lệ' : e.message); }
  }

  /* ------------------------------------------------------------------ */
  /* Bảng chọn (sheet)                                                   */
  /* ------------------------------------------------------------------ */
  function sheet(title, content, actionLabel, onAction) {
    const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) close(); } });
    const close = () => wrap.remove();
    wrap.append(h('div', { class: 'sheet', role: 'dialog' },
      h('header', {}, h('b', { text: title }),
        actionLabel ? h('button', { onclick: () => onAction(close), text: actionLabel }) : h('button', { onclick: close, text: 'Đóng' })),
      h('div', { class: 'body' }, content)));
    document.body.append(wrap);
    return close;
  }

  function openNewMenu() {
    const close = sheet('Tạo mới', h('div', {},
      h('button', { class: 'btn ghost', onclick: () => { close(); pickPerson(); } }, 'Nhắn tin mới'),
      h('div', { style: 'height:10px' }),
      h('button', { class: 'btn ghost', onclick: () => { close(); pickGroup(); } }, 'Tạo nhóm chat')));
  }

  // Ô tìm người dùng dùng chung cho 3 trường hợp
  function userSearch({ multi, exclude = [], onPick }) {
    const selected = new Map();
    const input = h('input', { class: 'search', type: 'search', placeholder: 'Tìm theo tên hoặc tên đăng nhập (≥ 2 ký tự)', autocapitalize: 'none', autocorrect: 'off' });
    const results = h('div', {}, h('p', { class: 'empty', style: 'padding:24px', text: 'Nhập tên để tìm người dùng' }));
    let timer, seq = 0;
    function draw(users) {
      results.replaceChildren(...users.map(u => {
        const row = h('button', { class: 'pick' + (selected.has(u.id) ? ' sel' : ''), onclick: () => {
          if (!multi) return onPick(u);
          if (selected.has(u.id)) selected.delete(u.id); else selected.set(u.id, u);
          row.classList.toggle('sel', selected.has(u.id));
          onPick(null, selected);
        } },
        avatar(u.name, u.color, 'sm'),
        h('div', {}, h('b', { text: u.name }), h('small', { text: '@' + u.username })),
        multi ? h('span', { class: 'check' }, ico('check')) : null);
        return row;
      }));
      if (!users.length) results.append(h('p', { class: 'empty', style: 'padding:24px', text: 'Không tìm thấy' }));
    }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return;
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const { users } = await api('/api/users?q=' + encodeURIComponent(q));
          if (my === seq) draw(users.filter(u => !exclude.includes(u.id)));
        } catch (e) { toast(e.message); }
      }, 250);
    });
    return { node: h('div', {}, input, results), selected };
  }

  function pickPerson() {
    let close;
    const s = userSearch({ multi: false, onPick: async u => {
      try {
        const { conversation } = await api('/api/conversations', { method: 'POST', body: { type: 'direct', peer: u.id } });
        upsertConv(conversation); close(); openConv(conversation.id);
      } catch (e) { toast(e.message); }
    } });
    close = sheet('Nhắn tin mới', s.node);
  }

  function pickGroup() {
    const nameInput = h('input', { class: 'search', placeholder: 'Tên nhóm', maxlength: 50 });
    let sel = new Map();
    const s = userSearch({ multi: true, onPick: (_, m) => { if (m) sel = m; } });
    sheet('Tạo nhóm', h('div', {}, nameInput, s.node), 'Tạo', async close => {
      try {
        const { conversation } = await api('/api/conversations', { method: 'POST', body: { type: 'group', name: nameInput.value, members: [...sel.keys()] } });
        upsertConv(conversation); close(); openConv(conversation.id);
      } catch (e) { toast(e.message); }
    });
  }

  function groupInfo(c) {
    const body = h('div', {},
      h('div', {}, c.members.map(m => h('div', { class: 'pick' }, avatar(m.name, m.color, 'sm', S.online.has(m.id)),
        h('div', {}, h('b', { text: m.name + (m.id === myId() ? ' (Bạn)' : '') }), h('small', { text: '@' + m.username }))))),
      h('div', { style: 'height:12px' }),
      h('button', { class: 'btn ghost', onclick: () => { close(); addMembers(c); } }, 'Thêm thành viên'));
    const close = sheet(`${c.name} · ${c.members.length} thành viên`, body);
  }
  function addMembers(c) {
    let sel = new Map();
    const s = userSearch({ multi: true, exclude: c.members.map(m => m.id), onPick: (_, m) => { if (m) sel = m; } });
    sheet('Thêm thành viên', s.node, 'Thêm', async close => {
      if (!sel.size) return;
      try {
        const { conversation } = await api(`/api/conversations/${c.id}/members`, { method: 'POST', body: { members: [...sel.keys()] } });
        upsertConv(conversation); close(); updateChatHeader(); toast('Đã thêm thành viên');
      } catch (e) { toast(e.message); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Màn hình chat                                                       */
  /* ------------------------------------------------------------------ */
  function openConv(id) {
    S.cur = id;
    history.pushState({ c: id }, '');
    renderChat();
    if (S.msgs.has(id)) { updateMsgs(true); syncConv(id); markRead(id); }
    else loadMessages(id);
  }
  function closeConv() {
    if (history.state && history.state.c) history.back();
    else { S.cur = null; render(); }
  }
  window.addEventListener('popstate', () => {
    if (S.cur && !(history.state && history.state.c)) { S.cur = null; render(); }
  });

  function chatSubtitle(c) {
    if (c.type === 'group') return `${c.members.length} thành viên`;
    return S.online.has(c.peer) ? 'Đang hoạt động' : 'Ngoại tuyến';
  }
  function updateChatHeader() {
    const c = convOf(S.cur);
    const t = document.getElementById('chat-title'), s = document.getElementById('chat-sub');
    if (c && t) { t.textContent = c.name; s.textContent = chatSubtitle(c); }
  }
  function refreshPresence() {
    if (S.cur) updateChatHeader(); else if (S.tab === 'chats') render();
  }

  function renderChat() {
    const c = convOf(S.cur);
    const isGroup = c.type === 'group';
    const fileInput = h('input', { type: 'file', class: 'hidden', onchange: e => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) sendFile(c.id, f);
    } });
    const ta = h('textarea', { rows: 1, placeholder: 'Nhập tin nhắn', 'aria-label': 'Tin nhắn', enterkeyhint: 'enter' });
    const doSend = () => {
      const text = ta.value.trim();
      if (!text) return;
      queueMsg(c.id, { kind: 'text', text });
      ta.value = ''; fit(); ta.focus();
    };
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
    ta.addEventListener('input', () => {
      fit();
      if (Date.now() - lastTypingSent > 2500 && ta.value) { lastTypingSent = Date.now(); wsSend({ t: 'typing', conv: c.id }); }
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); doSend(); }
    });
    ta.addEventListener('focus', () => setTimeout(() => { const b = document.getElementById('msgs'); if (b) b.scrollTop = b.scrollHeight; }, 300));

    const msgs = h('div', { class: 'msgs', id: 'msgs' });
    msgs.addEventListener('scroll', () => { msgs.dataset.stick = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120 ? '1' : ''; }, { passive: true });

    $app.replaceChildren(
      h('div', { class: 'topbar' },
        iconBtn('back', 'Quay lại', closeConv),
        h('div', { class: 'title', onclick: isGroup ? () => groupInfo(convOf(S.cur)) : null },
          h('b', { id: 'chat-title', text: c.name }), h('small', { id: 'chat-sub', text: chatSubtitle(c) })),
        isGroup ? iconBtn('users', 'Thành viên', () => groupInfo(convOf(S.cur))) : null,
        !isGroup ? iconBtn('phone', 'Gọi thoại', () => startCall(convOf(S.cur).peer, false)) : null,
        !isGroup ? iconBtn('video', 'Gọi video', () => startCall(convOf(S.cur).peer, true)) : null),
      connBar(),
      msgs,
      h('div', { class: 'typing', id: 'typing' }),
      h('div', { class: 'composer' },
        iconBtn('clip', 'Đính kèm', () => fileInput.click()), fileInput,
        ta,
        h('button', { class: 'icon-btn send', 'aria-label': 'Gửi', onclick: doSend, onpointerdown: e => e.preventDefault() }, ico('send'))));
    updateConn();
    updateMsgs(true);
  }

  function linkify(text) {
    const out = [];
    const re = /https?:\/\/[^\s<>"']+/gi;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const url = m[0].replace(/[.,;:!?)]+$/, '');
      out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--blue)' }, url));
      last = m.index + url.length; re.lastIndex = last;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function msgNode(m, c, prev, pending) {
    const mine = m.from === myId();
    const showHead = c.type === 'group' && !mine && (!prev || prev.from !== m.from || !sameDay(prev.t, m.t));
    const sender = S.users.get(m.from);
    const time = h('span', { class: 'time', text: fmtTime(m.t) });
    let inner, cls = 'bubble' + (pending ? ' pending' : '');
    if (m.kind === 'image' && m.file) {
      cls += ' img';
      const img = h('img', { alt: m.file.name, loading: 'lazy', style: 'min-height:80px;min-width:80px;background:#dfe6ef', onclick: () => openViewer(m.file) });
      fileUrl(m.file).then(u => { img.src = u; img.style.minHeight = ''; }).catch(() => { img.alt = 'Không tải được ảnh'; });
      img.addEventListener('load', () => { const box = document.getElementById('msgs'); if (box && box.dataset.stick) box.scrollTop = box.scrollHeight; });
      inner = [img, time];
    } else if (m.kind === 'file' && m.file) {
      const ext = (m.file.name.split('.').pop() || 'file').slice(0, 4);
      inner = [h('a', { class: 'filecard', href: '#', onclick: e => { e.preventDefault(); saveFile(m.file); } },
        h('div', { class: 'ico', text: ext }), h('div', {}, h('b', { text: m.file.name }), h('small', { text: fmtSize(m.file.size) }))), time];
    } else if (m.kind === 'call') {
      const ci = callInfo(m);
      let isVideo = false; try { isVideo = JSON.parse(m.text).k === 'video'; } catch { /* ignore */ }
      inner = [h('div', { class: 'callmsg' + (ci.miss ? ' miss' : '') }, ico(isVideo ? 'video' : 'phone'), ci.text), time];
    } else {
      inner = [...linkify(m.text), time];
    }
    const bubble = h('div', { class: cls }, showHead ? h('span', { class: 'who', text: sender ? sender.name : 'Người dùng' }) : null, inner);
    return h('div', { class: 'msg' + (mine ? ' me' : '') },
      c.type === 'group' && !mine ? h('div', { class: 'av' }, showHead && sender ? avatar(sender.name, sender.color, 'sm') : null) : null,
      bubble);
  }

  function updateMsgs(forceBottom) {
    const box = document.getElementById('msgs');
    const c = convOf(S.cur);
    if (!box || !c) return;
    const arr = S.msgs.get(c.id);
    if (!arr) { box.replaceChildren(h('div', { class: 'empty', text: 'Đang tải...' })); return; }
    const stick = forceBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    const nodes = [];
    if (S.hasMore.get(c.id)) nodes.push(h('div', { class: 'loadmore' }, h('button', { onclick: loadOlder }, 'Tải tin nhắn cũ hơn')));
    const all = [...arr, ...S.pending.filter(p => p.conv === c.id).map(p => ({ ...p, id: p.cid, from: myId(), _pending: true }))];
    let prev = null, lastMine = null;
    for (const m of all) if (m.from === myId() && !m._pending) lastMine = m;
    for (const m of all) {
      if (!prev || !sameDay(prev.t, m.t)) nodes.push(h('div', { class: 'day' }, h('span', { text: fmtDay(m.t) })));
      nodes.push(msgNode(m, c, prev, m._pending));
      if (lastMine && m.id === lastMine.id && !S.pending.some(p => p.conv === c.id)) nodes.push(h('div', { class: 'status', text: statusText(c, m) }));
      prev = m;
    }
    if (!all.length) nodes.push(h('div', { class: 'empty', text: 'Hãy gửi lời chào đầu tiên 👋' }));
    box.replaceChildren(...nodes);
    if (stick) { box.scrollTop = box.scrollHeight; box.dataset.stick = '1'; }
  }
  function statusText(c, m) {
    const readers = c.members.filter(u => u.id !== myId() && ((c.lastRead && c.lastRead[u.id]) || 0) >= m.seq);
    if (c.type === 'direct') return readers.length ? 'Đã xem' : 'Đã gửi';
    return readers.length ? `Đã xem (${readers.length})` : 'Đã gửi';
  }

  // Bàn phím iOS: co giao diện theo vùng nhìn thấy để ô nhập không bị che
  if (window.visualViewport) {
    const fit = () => {
      $app.style.height = window.visualViewport.height + 'px';
      window.scrollTo(0, 0);
      const box = document.getElementById('msgs');
      if (box && box.dataset.stick) box.scrollTop = box.scrollHeight;
    };
    window.visualViewport.addEventListener('resize', fit);
    window.visualViewport.addEventListener('scroll', fit);
    fit();
  }

  /* ------------------------------------------------------------------ */
  /* Gọi thoại / video (WebRTC)                                          */
  /* ------------------------------------------------------------------ */
  async function getMedia(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Cần mở bằng HTTPS để dùng micro/camera', 4500);
      return null;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
    } catch (e) {
      if (e.name === 'NotAllowedError') toast('Chưa cấp quyền micro/camera. Vào Cài đặt > Safari (hoặc ứng dụng) để cho phép.', 5000);
      else if (e.name === 'NotFoundError') toast('Không tìm thấy micro/camera', 3500);
      else toast('Không mở được micro/camera: ' + e.name, 3500);
      return null;
    }
  }

  async function startCall(peerId, video) {
    if (S.call) { toast('Bạn đang trong một cuộc gọi'); return; }
    if (!S.wsOk) { toast('Đang mất kết nối, thử lại sau giây lát'); return; }
    const peer = S.users.get(peerId);
    const local = await getMedia(video);
    if (!local) return;
    const id = rid();
    const call = S.call = { id, peer, video, dir: 'out', state: 'calling', local, pendingIce: [], t0: null, facing: 'user' };
    wsSend({ t: 'call', op: 'invite', to: peerId, callId: id, video });
    call.timeout = setTimeout(() => endCall('missed'), 45000);
    showCallUI();
  }

  function onCallSignal(m) {
    const c = S.call;
    if (m.op === 'invite') {
      if (c) { wsSend({ t: 'call', op: 'busy', to: m.from, callId: m.callId }); return; }
      const peer = S.users.get(m.from) || { id: m.from, name: m.fromName || 'Người dùng', color: '#0068ff' };
      S.call = { id: m.callId, peer, video: !!m.video, dir: 'in', state: 'ringing', pendingIce: [], t0: null, facing: 'user' };
      S.call.timeout = setTimeout(() => endCall('local', true), 50000);
      showCallUI();
      return;
    }
    if (m.op === 'handled') { if (c && c.id === m.callId && c.state === 'ringing') endCall('local', true); return; }
    if (!c || c.id !== m.callId) return;
    switch (m.op) {
      case 'accept': // người gọi: bên kia đã nghe máy -> tạo offer
        clearTimeout(c.timeout);
        c.state = 'connecting'; updateCallUI();
        makePc().then(async pc => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsSend({ t: 'call', op: 'offer', to: c.peer.id, callId: c.id, data: { type: offer.type, sdp: offer.sdp } });
        }).catch(() => endCall('failed'));
        break;
      case 'offer':
        (async () => {
          const pc = c.pc || await makePc();
          await pc.setRemoteDescription(m.data);
          await flushIce(c);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          wsSend({ t: 'call', op: 'answer', to: c.peer.id, callId: c.id, data: { type: answer.type, sdp: answer.sdp } });
        })().catch(() => endCall('failed'));
        break;
      case 'answer':
        if (c.pc) c.pc.setRemoteDescription(m.data).then(() => flushIce(c)).catch(() => endCall('failed'));
        break;
      case 'ice':
        if (c.pc && c.pc.remoteDescription) c.pc.addIceCandidate(m.data).catch(() => {});
        else c.pendingIce.push(m.data);
        break;
      case 'end': endCall('remote', true); break;
      case 'reject': endCall('reject', true); break;
      case 'busy': endCall('busy', true); break;
      case 'unavailable': endCall('unavailable', true); break;
      default: break;
    }
  }
  async function flushIce(c) {
    const list = c.pendingIce.splice(0);
    for (const cand of list) { try { await c.pc.addIceCandidate(cand); } catch { /* ignore */ } }
  }

  async function makePc() {
    const c = S.call;
    const pc = new RTCPeerConnection({ iceServers: S.ice });
    c.pc = pc;
    c.local.getTracks().forEach(t => pc.addTrack(t, c.local));
    pc.ontrack = e => {
      c.remote = e.streams[0] || new MediaStream([e.track]);
      attachStreams();
    };
    pc.onicecandidate = e => { if (e.candidate) wsSend({ t: 'call', op: 'ice', to: c.peer.id, callId: c.id, data: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (S.call !== c) return;
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(c.discTimer);
        if (c.state !== 'connected') { c.state = 'connected'; c.t0 = Date.now(); startCallTimer(); updateCallUI(); }
      } else if (st === 'disconnected') {
        clearTimeout(c.discTimer);
        c.discTimer = setTimeout(() => { if (S.call === c && pc.connectionState !== 'connected') endCall('failed'); }, 8000);
      } else if (st === 'failed') endCall('failed');
    };
    return pc;
  }

  async function acceptCall() {
    const c = S.call;
    if (!c || c.state !== 'ringing') return;
    const local = await getMedia(c.video);
    if (!S.call || S.call !== c) { if (local) local.getTracks().forEach(t => t.stop()); return; }
    if (!local) { declineCall(); return; }
    clearTimeout(c.timeout);
    c.local = local; c.state = 'connecting';
    await makePc();
    wsSend({ t: 'call', op: 'accept', to: c.peer.id, callId: c.id });
    showCallUI();
  }
  function declineCall() {
    const c = S.call;
    if (!c) return;
    wsSend({ t: 'call', op: 'reject', to: c.peer.id, callId: c.id });
    endCall('local', true);
  }

  function startCallTimer() {
    const c = S.call;
    clearInterval(c.timer);
    c.timer = setInterval(() => { if (S.call === c) updateCallStatus(); }, 1000);
  }

  function endCall(reason, silentRemote = false) {
    const c = S.call;
    if (!c) return;
    S.call = null;
    clearTimeout(c.timeout); clearTimeout(c.discTimer); clearInterval(c.timer);
    if (!silentRemote) wsSend({ t: 'call', op: 'end', to: c.peer.id, callId: c.id });
    try { c.pc && c.pc.close(); } catch { /* ignore */ }
    if (c.local) c.local.getTracks().forEach(t => t.stop());
    const ui = document.getElementById('call');
    if (ui) ui.remove();
    // Bên gọi ghi lại lịch sử cuộc gọi vào cuộc trò chuyện
    if (c.dir === 'out') {
      const conv = directConvWith(c.peer.id);
      if (conv) {
        const r = c.t0 ? 'done' : reason === 'missed' || reason === 'unavailable' ? 'missed' : reason === 'reject' ? 'reject' : reason === 'busy' ? 'busy' : 'cancel';
        queueMsg(conv.id, { kind: 'call', text: JSON.stringify({ k: c.video ? 'video' : 'audio', r, d: c.t0 ? Math.round((Date.now() - c.t0) / 1000) : 0 }) });
      }
    }
    const msg = { reject: 'Người nhận đã từ chối', busy: 'Người nhận đang bận', unavailable: 'Người nhận không trực tuyến', failed: 'Cuộc gọi bị gián đoạn', missed: 'Không có người trả lời' }[reason];
    if (msg) toast(msg);
  }

  function showCallUI() {
    let ui = document.getElementById('call');
    if (!ui) {
      const remote = h('video', { class: 'remote', autoplay: true, playsinline: true, id: 'remote-video' });
      const local = h('video', { class: 'local', autoplay: true, playsinline: true, muted: true, id: 'local-video' });
      local.muted = true;
      ui = h('div', { class: 'call', id: 'call' }, remote, local, h('div', { class: 'info', id: 'call-info' }), h('div', { class: 'controls', id: 'call-controls' }));
      document.body.append(ui);
    }
    attachStreams();
    updateCallUI();
  }
  function attachStreams() {
    const c = S.call;
    if (!c) return;
    const lv = document.getElementById('local-video'), rv = document.getElementById('remote-video');
    if (lv && c.local && lv.srcObject !== c.local) { lv.srcObject = c.local; lv.play().catch(() => {}); }
    if (rv && c.remote && rv.srcObject !== c.remote) { rv.srcObject = c.remote; rv.play().catch(() => {}); }
  }
  function callStatusText(c) {
    return { calling: 'Đang gọi...', ringing: c.video ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến', connecting: 'Đang kết nối...' }[c.state]
      || fmtDur(Math.round((Date.now() - c.t0) / 1000));
  }
  function updateCallStatus() {
    const el = document.getElementById('call-status');
    if (el && S.call) el.textContent = callStatusText(S.call);
  }

  function updateCallUI() {
    const c = S.call, ui = document.getElementById('call');
    if (!c || !ui) return;
    const videoOn = c.video && c.state === 'connected';
    ui.classList.toggle('video-on', videoOn);
    ui.querySelector('#local-video').classList.toggle('hidden', !(c.video && c.local));
    ui.querySelector('#local-video').style.transform = c.facing === 'user' ? 'scaleX(-1)' : 'none';
    const info = ui.querySelector('#call-info');
    info.classList.toggle('compact', videoOn);
    info.replaceChildren(avatar(c.peer.name, c.peer.color), h('h2', { text: c.peer.name }), h('p', { id: 'call-status', text: callStatusText(c) }));
    const cb = (icon, label, cls, fn) => h('button', { class: 'cbtn ' + cls, 'aria-label': label, onclick: fn }, ico(icon));
    const ctr = ui.querySelector('#call-controls');
    if (c.state === 'ringing') {
      ctr.replaceChildren(cb('phone', 'Từ chối', 'hang', declineCall), cb(c.video ? 'video' : 'phone', 'Trả lời', 'acc', acceptCall));
    } else {
      const audioTrack = c.local && c.local.getAudioTracks()[0];
      const videoTrack = c.local && c.local.getVideoTracks()[0];
      const muted = audioTrack && !audioTrack.enabled, camOff = videoTrack && !videoTrack.enabled;
      ctr.replaceChildren(
        cb(muted ? 'micOff' : 'mic', 'Micro', muted ? 'off' : '', () => { if (audioTrack) audioTrack.enabled = !audioTrack.enabled; updateCallUI(); }),
        c.video ? cb(camOff ? 'videoOff' : 'video', 'Camera', camOff ? 'off' : '', () => { if (videoTrack) videoTrack.enabled = !videoTrack.enabled; updateCallUI(); }) : null,
        c.video ? cb('flip', 'Đổi camera', '', flipCamera) : null,
        cb('phone', 'Kết thúc', 'hang', () => endCall('local')));
    }
  }

  async function flipCamera() {
    const c = S.call;
    if (!c || !c.local) return;
    const old = c.local.getVideoTracks()[0];
    const facing = c.facing === 'user' ? 'environment' : 'user';
    try {
      if (old) { old.stop(); c.local.removeTrack(old); } // iOS cần nhả camera cũ trước
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } } });
      const nt = s.getVideoTracks()[0];
      c.local.addTrack(nt);
      const sender = c.pc && c.pc.getSenders().find(x => x.track && x.track.kind === 'video' || x.track === null);
      if (sender) await sender.replaceTrack(nt);
      c.facing = facing;
      const lv = document.getElementById('local-video');
      if (lv) { lv.srcObject = c.local; lv.play().catch(() => {}); }
      updateCallUI();
    } catch { toast('Không đổi được camera'); }
  }

  window.addEventListener('beforeunload', () => { if (S.call) wsSend({ t: 'call', op: 'end', to: S.call.peer.id, callId: S.call.id }); });

  /* ------------------------------------------------------------------ */
  /* Khởi chạy                                                           */
  /* ------------------------------------------------------------------ */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  if (S.token) boot(); else renderAuth();
})();
