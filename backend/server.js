const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const PORT     = process.env.PORT     || 3000;
const ROOM_MAX = parseInt(process.env.ROOM_MAX ?? '50', 10);

// ── Identity Generator ────────────────────────────────────────────────────────
const adjectives = ['Neon','Cyber','Quantum','Cosmic','Solar','Lunar','Stellar',
  'Aero','Nova','Echo','Hyper','Turbo','Ultra','Mega','Giga','Phantom','Volt','Blaze',
  'Prism','Vortex','Apex','Zephyr','Forge','Pulse','Rift'];
const nouns = ['Tiger','Fox','Wolf','Hawk','Falcon','Panther','Viper','Lynx',
  'Bear','Owl','Shark','Eagle','Cobra','Dragon','Raven','Phoenix','Lynx','Mantis','Puma'];
const colors = ['#FF453A','#32D74B','#0A84FF','#FF9F0A','#BF5AF2',
  '#FF375F','#5E6AD2','#FFD60A','#30D158','#64D2FF','#FF6961','#FFAB40'];

function generateIdentity() {
  const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];
  return { name: `${adj} ${noun}`, color, initial: noun[0] };
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────
const RATE_WINDOW_MS  = 1000;   // 1 second window
const RATE_MAX_MSGS   = 20;     // max messages per window

function checkRateLimit(ws) {
  const now = Date.now();
  if (!ws.rateWindow || now - ws.rateWindow > RATE_WINDOW_MS) {
    ws.rateWindow = now;
    ws.rateCount  = 1;
    return true;
  }
  ws.rateCount++;
  return ws.rateCount <= RATE_MAX_MSGS;
}

// ── Room State ────────────────────────────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users:  new Set(),
      state:  { time: 0, playing: false, updatedAt: Date.now(), url: null },
      hostId: null,
    });
  }
  return rooms.get(roomId);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 25000;
const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL);
wss.on('close', () => clearInterval(heartbeatInterval));

// ── Connection Handler ────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  ws.id       = Math.random().toString(36).substr(2, 9);
  ws.identity = generateIdentity();
  ws.isAlive  = true;
  ws.roomId   = null;

  console.log(`[+] ${ws.id} (${ws.identity.name}) from ${req.socket.remoteAddress}`);

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (!checkRateLimit(ws)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
      return;
    }

    let data;
    try { data = JSON.parse(raw); }
    catch { return; }

    switch (data.type) {
      case 'join-room':    handleJoinRoom(ws, data.roomId);       break;
      case 'leave-room':   handleLeaveRoom(ws);                   break;
      case 'video-event':  handleVideoEvent(ws, data);            break;
      case 'chat-message': handleChatMessage(ws, data);           break;
      case 'claim-host':   handleClaimHost(ws);                   break;
      case 'release-host': handleReleaseHost(ws);                 break;
      case 'sync-now':     handleSyncNow(ws);                     break;
      case 'reaction':     handleReaction(ws, data);              break;
      case 'url-update':   handleUrlUpdate(ws, data);             break;
      case 'typing-start':
      case 'typing-stop':  handleTyping(ws, data.type);           break;
      case 'ping':         ws.send(JSON.stringify({ type: 'pong' })); break;
      default:
        console.warn(`Unknown type from ${ws.id}: ${data.type}`);
    }
  });

  ws.on('close',  () => { console.log(`[-] ${ws.id}`); handleLeaveRoom(ws); });
  ws.on('error',  (e) => console.error(`[!] ${ws.id}:`, e.message));
});

// ── Handlers ──────────────────────────────────────────────────────────────────
function handleJoinRoom(ws, roomId) {
  if (!roomId || typeof roomId !== 'string') return;
  roomId = roomId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  if (!roomId) return;

  handleLeaveRoom(ws);

  const room = getOrCreateRoom(roomId);
  if (room.users.size >= ROOM_MAX) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return;
  }

  ws.roomId = roomId;
  room.users.add(ws);

  broadcastToRoom(roomId, ws.id, {
    type: 'user-joined', userId: ws.id, identity: ws.identity,
  });

  const participants = Array.from(room.users).map(u => ({
    id: u.id, identity: u.identity, isHost: u.id === room.hostId,
  }));

  // Elapsed-time correction so joining mid-play gets the right timestamp
  let syncState = { ...room.state };
  if (syncState.playing) {
    const elapsed = (Date.now() - syncState.updatedAt) / 1000;
    syncState = { ...syncState, time: syncState.time + elapsed };
  }

  ws.send(JSON.stringify({
    type: 'sync-state',
    state: syncState,
    hostId: room.hostId,
    yourId: ws.id,
    participants,
  }));
}

function handleLeaveRoom(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  ws.roomId = null;

  const room = rooms.get(roomId);
  if (!room) return;

  room.users.delete(ws);

  if (room.users.size === 0) { rooms.delete(roomId); return; }

  let hostChanged = false;
  if (room.hostId === ws.id) {
    room.hostId = null;
    hostChanged = true;
  }

  broadcastToRoom(roomId, ws.id, {
    type: 'user-left', userId: ws.id, identity: ws.identity,
  });

  if (hostChanged) {
    broadcastToRoom(roomId, null, { type: 'host-changed', hostId: null });
  }
}

function handleVideoEvent(ws, data) {
  const room = rooms.get(ws.roomId);
  if (!room) return;

  const ignorable = data.event === 'waiting' || data.event === 'buffering-recovered' || data.event === 'drift';
  if (room.hostId && room.hostId !== ws.id && !ignorable) return;

  // ── FIX: seek does NOT change playing state ──────────────────────────────
  if (data.event === 'play')  { room.state.playing = true;  room.state.updatedAt = Date.now(); }
  if (data.event === 'pause') { room.state.playing = false; room.state.updatedAt = Date.now(); }
  // seek: preserve playing state, only update time + timestamp
  if (data.event === 'seek')  { room.state.updatedAt = Date.now(); }

  if (data.time !== undefined) room.state.time = data.time;

  broadcastToRoom(ws.roomId, ws.id, {
    type: 'video-sync',
    event:    data.event,
    time:     data.time,
    source:   ws.id,
    identity: ws.identity,
    playing:  room.state.playing,  // include current playing state so clients can act correctly
  });
}

function handleChatMessage(ws, data) {
  if (!ws.roomId) return;
  const message = (data.message || '').slice(0, 500).trim();
  if (!message) return;

  broadcastToRoom(ws.roomId, ws.id, {
    type: 'chat-message',
    userId:    ws.id,
    identity:  ws.identity,
    message,
    timestamp: Date.now(),
  });
}

function handleClaimHost(ws) {
  const room = rooms.get(ws.roomId);
  if (!room || room.hostId) return;
  room.hostId = ws.id;
  broadcastToRoom(ws.roomId, null, {
    type: 'host-changed', hostId: ws.id, identity: ws.identity,
  });
}

function handleReleaseHost(ws) {
  const room = rooms.get(ws.roomId);
  if (!room || room.hostId !== ws.id) return;
  room.hostId = null;
  broadcastToRoom(ws.roomId, null, { type: 'host-changed', hostId: null });
}

// ── NEW: host broadcasts their exact current position to all viewers ──────────
function handleSyncNow(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) return;
  // Anyone can trigger this, but it only uses host state if there is a host
  // If no host, use the sender's reported state from the message

  broadcastToRoom(ws.roomId, ws.id, {
    type:     'sync-now',
    time:     room.state.time,
    playing:  room.state.playing,
    identity: ws.identity,
  });
}

// ── NEW: floating emoji reactions ─────────────────────────────────────────────
const VALID_REACTIONS = new Set(['❤️','🔥','😂','👍','🤯','👏','💀','🎉','😮','😍']);

function handleReaction(ws, data) {
  if (!ws.roomId) return;
  const emoji = (data.emoji || '').trim();
  if (!VALID_REACTIONS.has(emoji)) return;

  broadcastToRoom(ws.roomId, null, {
    type:     'reaction',
    userId:   ws.id,
    identity: ws.identity,
    emoji,
    timestamp: Date.now(),
  });
}

// ── NEW: video URL sync ───────────────────────────────────────────────────────
function handleUrlUpdate(ws, data) {
  const room = rooms.get(ws.roomId);
  if (!room) return;
  if (room.hostId && room.hostId !== ws.id) return; // only host can update URL

  const url = (data.url || '').slice(0, 2000).trim();
  room.state.url = url;

  broadcastToRoom(ws.roomId, ws.id, {
    type:     'url-update',
    url,
    identity: ws.identity,
  });
}

function handleTyping(ws, type) {
  if (!ws.roomId) return;
  broadcastToRoom(ws.roomId, ws.id, { type, userId: ws.id, identity: ws.identity });
}

function broadcastToRoom(roomId, senderId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room.users) {
    if (client.id !== senderId && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status:  'ok',
  rooms:   rooms.size,
  clients: wss.clients.size,
  uptime:  process.uptime(),
}));

app.get('/room/:id/info', (req, res) => {
  const room = rooms.get(req.params.id.toLowerCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    participants: room.users.size,
    hasHost:      !!room.hostId,
    state:        room.state,
    isFull:       room.users.size >= ROOM_MAX,
  });
});

server.listen(PORT, () => console.log(`🎬 SyncWatch v2 server on port ${PORT}`));