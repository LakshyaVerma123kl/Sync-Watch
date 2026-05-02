// Mocking Chrome Extension APIs
window.chrome = {
  runtime: {
    listeners: [],
    onMessage: {
      addListener: (callback) => {
        window.chrome.runtime.listeners.push(callback);
      }
    },
    sendMessage: (message, callback) => {
      // Intercept 'to-server' messages and send via our own WebSocket
      if (message.type === 'to-server') {
        if (window.mockSocket && window.mockSocket.readyState === WebSocket.OPEN) {
          window.mockSocket.send(JSON.stringify(message.data));
        }
        
        if (message.data.type === 'join-room') {
          window.mockCurrentRoom = message.data.roomId;
        } else if (message.data.type === 'leave-room') {
          window.mockCurrentRoom = null;
        }
      }
      
      if (message.type === 'get-status' && callback) {
        callback({ 
          connected: window.mockSocket ? window.mockSocket.readyState === WebSocket.OPEN : false,
          room: window.mockCurrentRoom,
          myId: window.mockMyId
        });
      }
    }
  }
};

window.mockSocket = null;
window.mockCurrentRoom = null;
window.mockMyId = null;

function connectMockWebSocket() {
  window.mockSocket = new WebSocket('ws://localhost:3000');

  window.mockSocket.onopen = () => {
    console.log('Mock: Connected to server');
    // Force UI status check
    if (window.SyncUI) window.SyncUI.checkStatus();
  };

  window.mockSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'sync-state') {
      window.mockMyId = data.yourId;
    }
    // Forward to content scripts mimicking background.js
    window.chrome.runtime.listeners.forEach(l => l({ type: 'from-server', data }, {}, () => {}));
  };

  window.mockSocket.onclose = () => {
    console.log('Mock: Disconnected');
    setTimeout(connectMockWebSocket, 3000);
  };
}

connectMockWebSocket();
