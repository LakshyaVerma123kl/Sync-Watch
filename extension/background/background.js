let socket = null;
let currentRoom = null;
let myId = null;
const SERVER_URL = 'ws://localhost:3000';

function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    console.log('Connected to sync server');
    if (currentRoom) {
      socket.send(JSON.stringify({ type: 'join-room', roomId: currentRoom }));
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'sync-state') {
        myId = data.yourId;
      }
      
      // Forward server messages to active tabs
      chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'from-server', data }).catch(() => {});
        }
      });
    } catch (e) {
      console.error('Error parsing message', e);
    }
  };

  socket.onclose = () => {
    console.log('Disconnected from sync server, retrying in 3s...');
    setTimeout(connectWebSocket, 3000);
  };
  
  socket.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };
}

connectWebSocket();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'to-server') {
    if (message.data.type === 'join-room') {
      currentRoom = message.data.roomId;
    } else if (message.data.type === 'leave-room') {
      currentRoom = null;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message.data));
    }
  }
  
  if (message.type === 'get-status') {
    sendResponse({ 
      connected: socket ? socket.readyState === WebSocket.OPEN : false,
      room: currentRoom,
      myId: myId
    });
  }
});
