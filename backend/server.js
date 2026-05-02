const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// ── Identity Generator ────────────────────────────────────────────────────────
const adjectives = ['Neon','Cyber','Quantum','Cosmic','Solar','Lunar','Stellar',
  'Aero','Nova','Echo','Hyper','Turbo','Ultra','Mega','Giga','Phantom','Volt','Blaze'];
const nouns = ['Tiger','Fox','Wolf','Hawk','Falcon','Panther','Viper','Lynx',
  'Bear','Owl','Shark','Eagle','Cobra','Dragon','Raven','Phoenix'];
const colors = ['#FF453A','#32D74B','#0A84FF','#FF9F0A','#BF5AF2',
  '#FF375F','#5E6AD2','#FFD60A','#30D158','#64D2FF','#FF6961','#FFAB40'];

function generateIdentity() {
  const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const name  = `${adj} ${noun}`;
  const color = colors[Math.floor(Math.random() * colors.length)];
  return { name, color, initial: noun[0] };
}

// ── Room State ────────────────────────────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Set(),
      state: { time: 0, playing: false, updatedAt: Date.now() },
      hostId: null,
    });
  }
  return rooms.get(roomId);
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room && room.users.size === 0) {
    rooms.delete(roomId);
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 25000; // 25 s — keeps Render free tier alive
const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      console.log(`Terminating dead connection: ${ws.id}`);
      ws.terminate();
      continue;
    }
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

  console.log(`[+] ${ws.id} (${ws.identity.name}) connected from ${req.socket.remoteAddress}`);

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); }
    catch { return; }

    switch (data.type) {
      case 'join-room':    handleJoinRoom(ws, data.roomId); break;
      case 'leave-room':   handleLeaveRoom(ws);             break;
      case 'video-event':  handleVideoEvent(ws, data);      break;
      case 'chat-message': handleChatMessage(ws, data);     break;
      case 'claim-host':   handleClaimHost(ws);             break;
      case 'release-host': handleReleaseHost(ws);           break;
      case 'typing-start':
      case 'typing-stop':  handleTyping(ws, data.type);     break;
      case 'ping':         ws.send(JSON.stringify({ type: 'pong' })); break;
      default:
        console.warn(`Unknown message type from ${ws.id}: ${data.type}`);
    }
  });

  ws.on('close',  () => { console.log(`[-] ${ws.id} disconnected`); handleLeaveRoom(ws); });
  ws.on('error',  (e) => console.error(`[!] ${ws.id} error:`, e.message));
});

// ── Handlers ──────────────────────────────────────────────────────────────────
function handleJoinRoom(ws, roomId) {
  if (!roomId || typeof roomId !== 'string') return;
  roomId = roomId.trim().toLowerCase().slice(0, 32);

  handleLeaveRoom(ws);
  ws.roomId = roomId;

  const room = getOrCreateRoom(roomId);
  room.users.add(ws);

  // Notify existing participants
  broadcastToRoom(roomId, ws.id, {
    type: 'user-joined',
    userId: ws.id,
    identity: ws.identity,
  });

  // Build full participant list
  const participants = Array.from(room.users).map(u => ({
    id: u.id,
    identity: u.identity,
    isHost: u.id === room.hostId,
  }));

  // Correct for elapsed time if someone was playing
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

  if (room.users.size === 0) {
    rooms.delete(roomId);
    return;
  }

  let hostChanged = false;
  if (room.hostId === ws.id) {
    room.hostId = null;
    hostChanged = true;
  }

  broadcastToRoom(roomId, ws.id, {
    type: 'user-left',
    userId: ws.id,
    identity: ws.identity,
  });

  if (hostChanged) {
    broadcastToRoom(roomId, null, { type: 'host-changed', hostId: null });
  }
}

function handleVideoEvent(ws, data) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  // Host-lock: only host (or no host) can drive playback
  const ignorable = data.event === 'waiting' || data.event === 'buffering-recovered';
  if (room.hostId && room.hostId !== ws.id && !ignorable) return;

  if (data.event === 'play')  { room.state.playing = true;  room.state.updatedAt = Date.now(); }
  if (data.event === 'pause') { room.state.playing = false; room.state.updatedAt = Date.now(); }
  if (data.event === 'seek')  { room.state.playing = false; room.state.updatedAt = Date.now(); }
  if (data.time !== undefined) room.state.time = data.time;

  broadcastToRoom(roomId, ws.id, {
    type: 'video-sync',
    event: data.event,
    time: data.time,
    source: ws.id,
    identity: ws.identity,
  });
}

function handleChatMessage(ws, data) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const message = (data.message || '').slice(0, 500).trim();
  if (!message) return;

  broadcastToRoom(roomId, ws.id, {
    type: 'chat-message',
    userId: ws.id,
    identity: ws.identity,
    message,
    timestamp: Date.now(),
  });
}

function handleClaimHost(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room || room.hostId) return; // only if unclaimed

  room.hostId = ws.id;
  broadcastToRoom(roomId, null, {
    type: 'host-changed',
    hostId: ws.id,
    identity: ws.identity,
  });
}

function handleReleaseHost(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room || room.hostId !== ws.id) return;

  room.hostId = null;
  broadcastToRoom(roomId, null, { type: 'host-changed', hostId: null });
}

function handleTyping(ws, type) {
  const roomId = ws.roomId;
  if (!roomId) return;
  broadcastToRoom(roomId, ws.id, { type, userId: ws.id, identity: ws.identity });
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
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size, clients: wss.clients.size }));

app.get('/room/:id/info', (req, res) => {
  const room = rooms.get(req.params.id.toLowerCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    participants: room.users.size,
    hasHost: !!room.hostId,
    state: room.state,
  });
});

server.listen(PORT, () => console.log(`🎬 SyncWatch server running on port ${PORT}`));