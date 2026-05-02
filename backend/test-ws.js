const WebSocket = require('ws');

const ws = new WebSocket('wss://sync-watch-ufrb.onrender.com');

ws.on('open', function open() {
  console.log('Connected to backend successfully');
  ws.close();
});

ws.on('error', function error(err) {
  console.error('Connection error:', err);
});
