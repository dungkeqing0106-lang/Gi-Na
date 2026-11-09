'use strict';
/**
 * Zalo Lite - server (không cần cài thư viện nào, chỉ cần Node.js >= 18)
 *  - HTTP: API JSON + phục vụ file tĩnh (PWA)
 *  - WebSocket (tự cài đặt theo RFC 6455): tin nhắn realtime, "đang soạn tin", đã xem, signaling WebRTC
 *  - Lưu trữ: db.json + thư mục files/ ; tự sao lưu mỗi ngày vào backups/
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const FILES_DIR = path.join(DATA_DIR, 'files');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_UPLOAD = 25 * 1024 * 1024; // 25 MB / tệp
const MAX_WS_FRAME = 1024 * 1024;
const BACKUPS_KEEP = 14;

fs.mkdirSync(FILES_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Cơ sở dữ liệu (JSON, ghi nguyên tử, debounce)                        */
/* ------------------------------------------------------------------ */
let db = { users: {}, sessions: {}, convs: {}, messages: {}, files: {} };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('Không đọc được db.json:', e.message);
    process.exit(1);
  }
}
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 300);
}
function saveNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function dailyBackup() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUP_DIR, `db-${day}.json`);
    if (!fs.existsSync(target) && fs.existsSync(DB_FILE)) {
      saveNow();
      fs.copyFileSync(DB_FILE, target);
    }
    const old = fs.readdirSync(BACKUP_DIR).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (old.length > BACKUPS_KEEP) fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
  } catch (e) { console.error('Sao lưu tự động lỗi:', e.message); }
}
dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */
const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();
const COLORS = ['#0068ff', '#00a884', '#e8590c', '#9c36b5', '#d6336c', '#1c7ed6', '#2f9e44', '#f08c00'];

function hashPassword(pw, salt = rid(16)) {
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(pw, u) {
  const a = Buffer.from(crypto.scryptSync(pw, u.salt, 64).toString('hex'));
  const b = Buffer.from(u.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const pub = u => ({ id: u.id, username: u.username, name: u.name, color: u.color });

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const fail = (res, code, msg) => sendJson(res, code, { error: msg });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Dữ liệu quá lớn'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit = 256 * 1024) {
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('JSON không hợp lệ'), { status: 400 }); }
}

function tokenFrom(req, url) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return url.searchParams.get('token') || '';
}
function userFromToken(token) {
  const s = db.sessions[token];
  return s ? db.users[s.userId] || null : null;
}

// Giới hạn đăng nhập sai
const loginFails = new Map();
function loginKey(req, username) { return (req.socket.remoteAddress || '') + '|' + username; }
function loginBlocked(key) {
  const f = loginFails.get(key);
  if (!f) return false;
  if (now() - f.t > 10 * 60 * 1000) { loginFails.delete(key); return false; }
  return f.n >= 8;
}
function loginFailed(key) {
  const f = loginFails.get(key);
  if (!f || now() - f.t > 10 * 60 * 1000) loginFails.set(key, { n: 1, t: now() });
  else f.n++;
}

/* ------------------------------------------------------------------ */
/* Hội thoại / tin nhắn                                                */
/* ------------------------------------------------------------------ */
const isMember = (c, uid) => c && c.members.includes(uid);

function convView(c, me) {
  const list = db.messages[c.id] || [];
  const lastRead = c.lastRead[me] || 0;
  let unread = 0;
  for (let i = list.length - 1; i >= 0 && list[i].seq > lastRead; i--) if (list[i].from !== me) unread++;
  const members = c.members.map(id => db.users[id]).filter(Boolean).map(pub);
  const view = {
    id: c.id, type: c.type, members, seq: c.seq, unread,
    lastRead: c.lastRead, last: list[list.length - 1] || null, createdAt: c.createdAt,
  };
  if (c.type === 'direct') {
    const other = members.find(m => m.id !== me) || members[0];
    view.name = other ? other.name : 'Người dùng';
    view.peer = other ? other.id : null;
    view.color = other ? other.color : '#888';
  } else {
    view.name = c.name;
    view.color = c.color || '#0068ff';
  }
  return view;
}

function myConvs(uid) {
  return Object.values(db.convs).filter(c => isMember(c, uid));
}

function addMessage(conv, from, { kind = 'text', text = '', file = null, cid = null }) {
  const list = (db.messages[conv.id] ||= []);
  if (cid) { // chống gửi trùng khi gửi lại sau mất kết nối
    for (let i = list.length - 1, n = 0; i >= 0 && n < 100; i--, n++) {
      if (list[i].cid === cid && list[i].from === from) return { msg: list[i], dup: true };
    }
  }
  conv.seq += 1;
  const msg = { id: rid(8), conv: conv.id, seq: conv.seq, from, kind, text, file, t: now() };
  if (cid) msg.cid = cid;
  list.push(msg);
  conv.lastRead[from] = conv.seq; // người gửi coi như đã đọc đến đây
  save();
  broadcast(conv.members, { t: 'msg', m: msg });
  return { msg, dup: false };
}

/* ------------------------------------------------------------------ */
/* WebSocket tối giản (RFC 6455)                                       */
/* ------------------------------------------------------------------ */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsFrame(opcode, payload) {
  const len = payload.length;
  let h;
  if (len < 126) h = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | opcode; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, payload]);
}

const online = new Map(); // userId -> Set<Peer>

class Peer {
  constructor(socket, user) {
    this.socket = socket; this.user = user;
    this.buf = Buffer.alloc(0); this.frags = []; this.fragSize = 0; this.fragOp = 0;
    this.alive = true; this.budget = 150; this.closed = false;
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => socket.destroy());
    socket.setNoDelay(true);
  }
  send(obj) {
    if (this.closed || this.socket.destroyed) return;
    this.socket.write(wsFrame(1, Buffer.from(JSON.stringify(obj))));
  }
  close(code = 1000) {
    if (this.closed) return;
    try { this.socket.end(wsFrame(8, Buffer.from([code >> 8, code & 255]))); } catch { /* ignore */ }
    setTimeout(() => this.socket.destroy(), 1000).unref();
  }
  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_WS_FRAME)) return this.close(1009);
        len = Number(big); off = 10;
      }
      if (len > MAX_WS_FRAME) return this.close(1009);
      if (!masked) return this.close(1002);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this.socket.write(wsFrame(0xA, data)); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        if (op !== 0x0) this.fragOp = op;
        this.fragSize += data.length;
        if (this.fragSize > MAX_WS_FRAME) return this.close(1009);
        this.frags.push(data);
        if (fin) {
          const full = Buffer.concat(this.frags);
          this.frags = []; this.fragSize = 0;
          if (this.fragOp === 0x1) this.onMessage(full.toString('utf8'));
        }
      }
    }
  }
  onMessage(text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    try { handleWs(this, m); } catch (e) { console.error('WS lỗi:', e); }
  }
  onClose() {
    if (this.closed) return;
    this.closed = true;
    const set = online.get(this.user.id);
    if (set) {
      set.delete(this);
      if (!set.size) { online.delete(this.user.id); notifyPresence(this.user.id, false); }
    }
  }
}

function sendTo(userId, obj, except = null) {
  const set = online.get(userId);
  if (!set) return false;
  let sent = false;
  for (const p of set) if (p !== except) { p.send(obj); sent = true; }
  return sent;
}
function broadcast(userIds, obj, except = null) {
  for (const id of userIds) sendTo(id, obj, except);
}
function contactsOf(uid) {
  const s = new Set();
  for (const c of myConvs(uid)) for (const id of c.members) if (id !== uid) s.add(id);
  return s;
}
function notifyPresence(uid, isOnline) {
  broadcast(contactsOf(uid), { t: 'presence', user: uid, online: isOnline });
}

setInterval(() => { // nạp lại hạn mức thao tác (chống spam)
  for (const set of online.values()) for (const p of set) p.budget = 150;
}, 5000).unref();

setInterval(() => { // ping + dọn kết nối chết
  for (const set of online.values()) for (const p of set) {
    if (!p.alive) { p.socket.destroy(); continue; }
    p.alive = false;
    try { p.socket.write(wsFrame(0x9, Buffer.alloc(0))); } catch { /* ignore */ }
  }
}, 25000).unref();

const CALL_OPS = new Set(['invite', 'accept', 'reject', 'end', 'offer', 'answer', 'ice', 'busy']);

function handleWs(peer, m) {
  const me = peer.user.id;
  if (--peer.budget < 0) return; // chống spam
  switch (m.t) {
    case 'msg': {
      const c = db.convs[m.conv];
      if (!isMember(c, me)) return;
      const kind = ['text', 'image', 'file', 'call'].includes(m.kind) ? m.kind : 'text';
      let text = typeof m.text === 'string' ? m.text.slice(0, 4000) : '';
      let file = null;
      if (kind === 'text' && !text.trim()) return;
      if (kind === 'image' || kind === 'file') {
        const f = db.files[m.file];
        if (!f || f.owner !== me) return;
        f.conv = c.id;
        file = { id: f.id, name: f.name, size: f.size, mime: f.mime };
      }
      if (kind === 'call') {
        try { const j = JSON.parse(text); text = JSON.stringify({ k: j.k === 'video' ? 'video' : 'audio', r: String(j.r).slice(0, 10), d: Number(j.d) || 0 }); }
        catch { return; }
      }
      const { msg } = addMessage(c, me, { kind, text, file, cid: typeof m.cid === 'string' ? m.cid.slice(0, 40) : null });
      peer.send({ t: 'ack', cid: m.cid || null, m: msg });
      break;
    }
    case 'typing': {
      const c = db.convs[m.conv];
      if (!isMember(c, me)) return;
      broadcast(c.members.filter(x => x !== me), { t: 'typing', conv: c.id, user: me });
      break;
    }
    case 'read': {
      const c = db.convs[m.conv];
      if (!isMember(c, me)) return;
      const upTo = Math.min(Number(m.upTo) || 0, c.seq);
      if (upTo > (c.lastRead[me] || 0)) {
        c.lastRead[me] = upTo; save();
        broadcast(c.members, { t: 'read', conv: c.id, user: me, upTo });
      }
      break;
    }
    case 'call': { // signaling WebRTC (chỉ gọi 1-1)
      if (!CALL_OPS.has(m.op) || typeof m.to !== 'string' || m.to === me || !db.users[m.to]) return;
      const shared = myConvs(me).some(c => c.type === 'direct' && c.members.includes(m.to));
      if (!shared) return;
      const out = { t: 'call', op: m.op, from: me, fromName: peer.user.name, callId: String(m.callId || '').slice(0, 40), video: !!m.video, data: m.data };
      if (m.op === 'invite') {
        if (!sendTo(m.to, out)) peer.send({ t: 'call', op: 'unavailable', from: m.to, callId: out.callId });
        return;
      }
      sendTo(m.to, out);
      if (m.op === 'accept' || m.op === 'reject') sendTo(me, { t: 'call', op: 'handled', from: m.to, callId: out.callId }, peer);
      break;
    }
    case 'ping': peer.send({ t: 'pong' }); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ */
/* ICE servers (STUN/TURN)                                             */
/* ------------------------------------------------------------------ */
function iceServers(userId) {
  const list = [{ urls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map(s => s.trim()) }];
  const turn = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (turn.length && process.env.TURN_SECRET) { // coturn "use-auth-secret": cấp thông tin tạm thời
    const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${userId}`;
    const credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
    list.push({ urls: turn, username, credential });
  } else if (turn.length && process.env.TURN_USER) {
    list.push({ urls: turn, username: process.env.TURN_USER, credential: process.env.TURN_PASS || '' });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* API HTTP                                                            */
/* ------------------------------------------------------------------ */
const INLINE_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'POST /api/register') {
    const b = await readJson(req);
    const username = String(b.username || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 40);
    const password = String(b.password || '');
    if (!/^[a-z0-9_.]{3,24}$/.test(username)) return fail(res, 400, 'Tên đăng nhập 3-24 ký tự: chữ thường, số, _ hoặc .');
    if (!name) return fail(res, 400, 'Vui lòng nhập tên hiển thị');
    if (password.length < 6) return fail(res, 400, 'Mật khẩu tối thiểu 6 ký tự');
    if (Object.values(db.users).some(u => u.username === username)) return fail(res, 409, 'Tên đăng nhập đã tồn tại');
    const id = rid(6);
    const { salt, hash } = hashPassword(password);
    db.users[id] = { id, username, name, salt, hash, color: COLORS[Object.keys(db.users).length % COLORS.length], createdAt: now() };
    const token = rid(24);
    db.sessions[token] = { userId: id, createdAt: now() };
    save();
    return sendJson(res, 200, { token, user: pub(db.users[id]) });
  }

  if (route === 'POST /api/login') {
    const b = await readJson(req);
    const username = String(b.username || '').trim().toLowerCase();
    const key = loginKey(req, username);
    if (loginBlocked(key)) return fail(res, 429, 'Đăng nhập sai quá nhiều lần, thử lại sau 10 phút');
    const u = Object.values(db.users).find(x => x.username === username);
    if (!u || !checkPassword(String(b.password || ''), u)) { loginFailed(key); return fail(res, 401, 'Sai tên đăng nhập hoặc mật khẩu'); }
    loginFails.delete(key);
    const token = rid(24);
    db.sessions[token] = { userId: u.id, createdAt: now() };
    save();
    return sendJson(res, 200, { token, user: pub(u) });
  }

  // Các API còn lại cần đăng nhập
  const token = tokenFrom(req, url);
  const me = userFromToken(token);
  if (!me) return fail(res, 401, 'Chưa đăng nhập');

  if (route === 'POST /api/logout') { delete db.sessions[token]; save(); return sendJson(res, 200, { ok: true }); }
  if (route === 'GET /api/me') return sendJson(res, 200, { user: pub(me) });
  if (route === 'GET /api/ice') return sendJson(res, 200, { iceServers: iceServers(me.id) });

  if (route === 'POST /api/profile') {
    const b = await readJson(req);
    const name = String(b.name || '').trim().slice(0, 40);
    if (name) me.name = name;
    save();
    return sendJson(res, 200, { user: pub(me) });
  }

  if (route === 'GET /api/users') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    if (q.length < 2) return sendJson(res, 200, { users: [] });
    const users = Object.values(db.users)
      .filter(u => u.id !== me.id && (u.username.startsWith(q) || u.name.toLowerCase().includes(q)))
      .slice(0, 20).map(pub);
    return sendJson(res, 200, { users });
  }

  if (route === 'GET /api/conversations') {
    const convs = myConvs(me.id).map(c => convView(c, me.id))
      .sort((a, b) => ((b.last ? b.last.t : b.createdAt) - (a.last ? a.last.t : a.createdAt)));
    return sendJson(res, 200, { conversations: convs });
  }

  if (route === 'POST /api/conversations') {
    const b = await readJson(req);
    let c;
    if (b.type === 'direct') {
      const peerUser = db.users[b.peer];
      if (!peerUser || peerUser.id === me.id) return fail(res, 400, 'Người dùng không hợp lệ');
      const id = 'd_' + [me.id, peerUser.id].sort().join('_');
      c = db.convs[id];
      if (!c) {
        c = db.convs[id] = { id, type: 'direct', members: [me.id, peerUser.id], createdBy: me.id, createdAt: now(), seq: 0, lastRead: {} };
        db.messages[id] = [];
        save();
      }
    } else if (b.type === 'group') {
      const name = String(b.name || '').trim().slice(0, 50);
      const members = [...new Set([me.id, ...(Array.isArray(b.members) ? b.members : [])])].filter(id => db.users[id]);
      if (!name) return fail(res, 400, 'Vui lòng nhập tên nhóm');
      if (members.length < 3) return fail(res, 400, 'Nhóm cần ít nhất 3 thành viên (gồm bạn)');
      if (members.length > 200) return fail(res, 400, 'Nhóm tối đa 200 thành viên');
      const id = 'g_' + rid(6);
      c = db.convs[id] = { id, type: 'group', name, members, createdBy: me.id, createdAt: now(), seq: 0, lastRead: {}, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
      db.messages[id] = [];
      save();
    } else return fail(res, 400, 'Loại hội thoại không hợp lệ');
    for (const id of c.members) if (id !== me.id) sendTo(id, { t: 'conv', c: convView(c, id) });
    return sendJson(res, 200, { conversation: convView(c, me.id) });
  }

  let mm;
  if ((mm = url.pathname.match(/^\/api\/conversations\/([\w-]+)\/members$/)) && req.method === 'POST') {
    const c = db.convs[mm[1]];
    if (!isMember(c, me.id) || c.type !== 'group') return fail(res, 404, 'Không tìm thấy nhóm');
    const b = await readJson(req);
    const add = (Array.isArray(b.members) ? b.members : []).filter(id => db.users[id] && !c.members.includes(id));
    if (c.members.length + add.length > 200) return fail(res, 400, 'Nhóm tối đa 200 thành viên');
    c.members.push(...add); save();
    for (const id of c.members) sendTo(id, { t: 'conv', c: convView(c, id) });
    return sendJson(res, 200, { conversation: convView(c, me.id) });
  }

  if (route === 'GET /api/messages') {
    const c = db.convs[url.searchParams.get('conv')];
    if (!isMember(c, me.id)) return fail(res, 404, 'Không tìm thấy hội thoại');
    const list = db.messages[c.id] || [];
    const after = Number(url.searchParams.get('after')) || 0;
    const before = Number(url.searchParams.get('before')) || 0;
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500);
    let out;
    if (after) out = list.filter(x => x.seq > after).slice(0, 500);
    else if (before) out = list.filter(x => x.seq < before).slice(-limit);
    else out = list.slice(-limit);
    return sendJson(res, 200, { messages: out, hasMore: out.length > 0 && out[0].seq > 1 });
  }

  if (route === 'POST /api/upload') {
    const convId = url.searchParams.get('conv');
    const c = db.convs[convId];
    if (!isMember(c, me.id)) return fail(res, 404, 'Không tìm thấy hội thoại');
    const declared = Number(req.headers['content-length']) || 0;
    if (declared > MAX_UPLOAD) return fail(res, 413, 'Tệp tối đa 25 MB');
    const body = await readBody(req, MAX_UPLOAD);
    if (!body.length) return fail(res, 400, 'Tệp rỗng');
    const name = path.basename(String(url.searchParams.get('name') || 'tep')).replace(/[^\p{L}\p{N}._ ()-]/gu, '_').slice(0, 120) || 'tep';
    const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100);
    const id = rid(12);
    fs.writeFileSync(path.join(FILES_DIR, id), body);
    db.files[id] = { id, name, mime, size: body.length, owner: me.id, conv: convId, t: now() };
    save();
    return sendJson(res, 200, { file: { id, name, mime, size: body.length } });
  }

  if ((mm = url.pathname.match(/^\/files\/(\w+)$/)) && req.method === 'GET') {
    const f = db.files[mm[1]];
    const c = f && db.convs[f.conv];
    if (!f || !isMember(c, me.id)) return fail(res, 404, 'Không tìm thấy tệp');
    const file = path.join(FILES_DIR, f.id);
    if (!fs.existsSync(file)) return fail(res, 404, 'Tệp đã bị xóa');
    const inline = INLINE_IMAGES.has(f.mime);
    res.writeHead(200, {
      'Content-Type': inline ? f.mime : 'application/octet-stream',
      'Content-Length': f.size,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    return fs.createReadStream(file).pipe(res);
  }

  // Sao lưu: tải toàn bộ lịch sử chat của tôi
  if (route === 'GET /api/backup') {
    const convs = myConvs(me.id).map(c => ({
      id: c.id, type: c.type, name: c.name || null, members: c.members, createdAt: c.createdAt,
      messages: db.messages[c.id] || [],
    }));
    const users = {};
    for (const c of convs) for (const id of c.members) if (db.users[id]) users[id] = { name: db.users[id].name, username: db.users[id].username };
    const payload = JSON.stringify({ app: 'zalo-lite', version: 1, exportedAt: now(), user: pub(me), users, conversations: convs });
    const day = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="zalo-lite-backup-${day}.json"`,
      'Cache-Control': 'no-store',
    });
    return res.end(payload);
  }

  // Khôi phục: chỉ khôi phục tin nhắn do CHÍNH BẠN gửi, trong các hội thoại bạn đang tham gia
  if (route === 'POST /api/restore') {
    const b = await readJson(req, 30 * 1024 * 1024);
    if (!b || b.app !== 'zalo-lite' || !Array.isArray(b.conversations)) return fail(res, 400, 'Tệp sao lưu không hợp lệ');
    let restored = 0, skipped = 0;
    for (const bc of b.conversations) {
      const c = db.convs[bc.id];
      if (!isMember(c, me.id) || !Array.isArray(bc.messages)) { skipped += Array.isArray(bc.messages) ? bc.messages.length : 0; continue; }
      const list = (db.messages[c.id] ||= []);
      const have = new Set(list.map(x => x.id));
      for (const m of bc.messages) {
        if (!m || m.from !== me.id || have.has(m.id) || !['text', 'image', 'file', 'call'].includes(m.kind)) { skipped++; continue; }
        if (m.file && !(db.files[m.file.id] && db.files[m.file.id].owner === me.id)) { skipped++; continue; }
        c.seq += 1;
        list.push({ id: String(m.id).slice(0, 32), conv: c.id, seq: c.seq, from: me.id, kind: m.kind, text: String(m.text || '').slice(0, 4000), file: m.file || null, t: Number(m.t) || now(), restored: true });
        restored++;
      }
      // Sắp xếp lại theo thời gian, đánh lại số thứ tự, giữ nguyên mốc "đã đọc" của từng người
      const readIds = {};
      for (const uid of c.members) { const r = list.find(x => x.seq === (c.lastRead[uid] || 0)); readIds[uid] = r ? r.id : null; }
      list.sort((x, y) => x.t - y.t || x.seq - y.seq);
      list.forEach((x, i) => { x.seq = i + 1; });
      c.seq = list.length;
      for (const uid of c.members) { const i = readIds[uid] ? list.findIndex(x => x.id === readIds[uid]) : -1; c.lastRead[uid] = i + 1; }
      c.lastRead[me.id] = c.seq;
    }
    save();
    for (const c of myConvs(me.id)) sendTo(me.id, { t: 'conv', c: convView(c, me.id) });
    return sendJson(res, 200, { restored, skipped });
  }

  return fail(res, 404, 'Không có API này');
}

/* ------------------------------------------------------------------ */
/* Tệp tĩnh                                                            */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Không tìm thấy');
  }
  const ext = path.extname(file);
  const noCache = ext === '.html' || p === '/sw.js' || p === '/app.js' || p === '/style.css';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400' });
  fs.createReadStream(file).pipe(res);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.end();
    if (!e.status) console.error(e);
    fail(res, e.status || 500, e.status ? e.message : 'Lỗi máy chủ');
  }
});

server.on('upgrade', (req, socket) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const user = url.pathname === '/ws' ? userFromToken(url.searchParams.get('token') || '') : null;
    const key = req.headers['sec-websocket-key'];
    if (!user || !key) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const peer = new Peer(socket, user);
    let set = online.get(user.id);
    const first = !set;
    if (!set) online.set(user.id, set = new Set());
    set.add(peer);
    const contacts = [...contactsOf(user.id)].filter(id => online.has(id));
    peer.send({ t: 'hello', me: pub(user), online: contacts });
    if (first) notifyPresence(user.id, true);
  } catch { socket.destroy(); }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Zalo Lite chạy tại http://localhost:${PORT}  (dữ liệu: ${DATA_DIR})`));
  const shutdown = () => { saveNow(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
module.exports = { server, saveNow };
