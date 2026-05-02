const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Identity Generator
const adjectives = ['Neon', 'Cyber', 'Quantum', 'Cosmic', 'Solar', 'Lunar', 'Stellar', 'Aero', 'Nova', 'Echo'];
const nouns = ['Tiger', 'Fox', 'Wolf', 'Hawk', 'Falcon', 'Panther', 'Viper', 'Lynx', 'Bear', 'Owl'];
const colors = ['#FF453A', '#32D74B', '#0A84FF', '#FF9F0A', '#BF5AF2', '#FF375F', '#5E6AD2', '#FFD60A'];

function generateIdentity() {
  const name = adjectives[Math.floor(Math.random() * adjectives.length)] + ' ' + 
               nouns[Math.floor(Math.random() * nouns.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const initial = name.split(' ')[1][0]; // First letter of the noun
  return { name, color, initial };
}

// Room state storage
const rooms = new Map();

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).substr(2, 9);
  ws.identity = generateIdentity();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  console.log(`User connected: ${ws.id} (${ws.identity.name})`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join-room':
          handleJoinRoom(ws, data.roomId);
          break;
        case 'leave-room':
          handleLeaveRoom(ws);
          break;
        case 'video-event':
          handleVideoEvent(ws, data);
          break;
        case 'chat-message':
          handleChatMessage(ws, data);
          break;
        case 'claim-host':
          handleClaimHost(ws);
          break;
        case 'typing-start':
        case 'typing-stop':
          handleTyping(ws, data.type);
          break;
        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (e) {
      console.error('Invalid message format:', e);
    }
  });

  ws.on('close', () => {
    console.log(`User disconnected: ${ws.id}`);
    handleLeaveRoom(ws);
  });
});

function handleJoinRoom(ws, roomId) {
  handleLeaveRoom(ws); // leave previous
  ws.roomId = roomId;

  if (!rooms.has(roomId)) {
    rooms.set(roomId, { 
      users: new Set(), 
      state: { time: 0, playing: false },
      hostId: null 
    });
  }
  const room = rooms.get(roomId);
  room.users.add(ws);

  // Notify others
  broadcastToRoom(roomId, ws.id, { 
    type: 'user-joined', 
    userId: ws.id,
    identity: ws.identity 
  });
  
  // Build participant list
  const participants = Array.from(room.users).map(client => ({
    id: client.id,
    identity: client.identity,
    isHost: client.id === room.hostId
  }));

  ws.send(JSON.stringify({ 
    type: 'sync-state', 
    state: room.state,
    hostId: room.hostId,
    yourId: ws.id,
    participants
  }));
}

function handleLeaveRoom(ws) {
  if (!ws.roomId) return;
  const roomId = ws.roomId;
  const room = rooms.get(roomId);
  
  if (room) {
    room.users.delete(ws);
    
    let hostChanged = false;
    if (room.hostId === ws.id) {
      room.hostId = null;
      hostChanged = true;
    }

    if (room.users.size === 0) {
      rooms.delete(roomId);
    } else {
      broadcastToRoom(roomId, ws.id, { 
        type: 'user-left', 
        userId: ws.id,
        identity: ws.identity 
      });
      if (hostChanged) {
        broadcastToRoom(roomId, null, { type: 'host-changed', hostId: null });
      }
    }
  }
  ws.roomId = null;
}

function handleVideoEvent(ws, data) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room) {
    if (room.hostId && room.hostId !== ws.id && data.event !== 'waiting' && data.event !== 'buffering-recovered') return; 

    if (data.event === 'play') room.state.playing = true;
    if (data.event === 'pause') room.state.playing = false;
    if (data.time !== undefined) room.state.time = data.time;

    broadcastToRoom(roomId, ws.id, {
      type: 'video-sync',
      event: data.event,
      time: data.time,
      source: ws.id,
      identity: ws.identity // Include identity so UI can say "Neon Tiger paused the video" if needed
    });
  }
}

function handleChatMessage(ws, data) {
  const roomId = ws.roomId;
  if (!roomId) return;
  broadcastToRoom(roomId, ws.id, {
    type: 'chat-message',
    userId: ws.id,
    identity: ws.identity,
    message: data.message,
    timestamp: Date.now()
  });
}

function handleClaimHost(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (room && !room.hostId) {
    room.hostId = ws.id;
    broadcastToRoom(roomId, null, { type: 'host-changed', hostId: ws.id, identity: ws.identity });
  }
}

function handleTyping(ws, type) {
  const roomId = ws.roomId;
  if (!roomId) return;
  broadcastToRoom(roomId, ws.id, {
    type: type, // 'typing-start' or 'typing-stop'
    userId: ws.id,
    identity: ws.identity
  });
}

function broadcastToRoom(roomId, senderId, message) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room.users) {
    if ((senderId === null || client.id !== senderId) && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

app.get('/health', (req, res) => res.status(200).send('OK'));
server.listen(PORT, () => console.log(`Sync Server running on port ${PORT}`));
