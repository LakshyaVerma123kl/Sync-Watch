// SyncWatch Background Service Worker v2
// Manages the single WebSocket connection and routes messages to content scripts.

const SERVER_URL = 'ws://localhost:3000'; // replaced by build.js for production

let socket      = null;
let currentRoom = null;
let myId        = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ── WebSocket Management ──────────────────────────────────────────────────────
function connectWebSocket() {
  if (socket &&
      (socket.readyState === WebSocket.OPEN ||
       socket.readyState === WebSocket.CONNECTING)) return;

  clearTimeout(reconnectTimer);
  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    console.log('[SyncWatch] Connected to sync server');
    reconnectDelay = 1000; // reset backoff
    broadcastToTabs({ type: 'connection-status', connected: true });

    if (currentRoom) {
      sendToServer({ type: 'join-room', roomId: currentRoom });
    }
  };

  socket.onmessage = ({ data }) => {
    let parsed;
    try { parsed = JSON.parse(data); } catch { return; }

    if (parsed.type === 'sync-state') {
      myId = parsed.yourId;
    }

    broadcastToTabs({ type: 'from-server', data: parsed });
  };

  socket.onclose = () => {
    console.log(`[SyncWatch] Disconnected. Reconnecting in ${reconnectDelay}ms…`);
    broadcastToTabs({ type: 'connection-status', connected: false });
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connectWebSocket();
    }, reconnectDelay);
  };

  socket.onerror = (err) => console.error('[SyncWatch] WebSocket error:', err);
}

function sendToServer(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

// ── Message Handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'to-server': {
      const { data } = message;

      if (data.type === 'join-room') {
        currentRoom = data.roomId;
        // persist room for service worker restarts
        chrome.storage.session.set({ currentRoom, myId }).catch(() => {});
      } else if (data.type === 'leave-room') {
        currentRoom = null;
        myId = null;
        chrome.storage.session.remove(['currentRoom', 'myId']).catch(() => {});
      }

      sendToServer(data);
      break;
    }

    case 'get-status':
      sendResponse({
        connected: socket?.readyState === WebSocket.OPEN ?? false,
        room: currentRoom,
        myId,
      });
      return true; // keep channel open

    case 'force-reconnect':
      socket?.close();
      connectWebSocket();
      break;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
// Restore session state after service worker restart
chrome.storage.session.get(['currentRoom', 'myId'], (result) => {
  if (result.currentRoom) currentRoom = result.currentRoom;
  if (result.myId)        myId        = result.myId;
  connectWebSocket();
});