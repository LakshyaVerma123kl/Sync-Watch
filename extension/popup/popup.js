const dot      = document.getElementById('status-dot');
const text     = document.getElementById('status-text');
const roomInfo = document.getElementById('room-info');
const roomDisp = document.getElementById('room-id-display');

function updateStatus(res) {
  if (!res) { text.textContent = 'Extension error'; return; }

  const on = res.connected;
  dot.classList.toggle('on', on);
  text.textContent = on ? 'Connected to server' : 'Server offline';

  if (res.room) {
    roomInfo.classList.add('visible');
    roomDisp.textContent = res.room;
  } else {
    roomInfo.classList.remove('visible');
  }
}

// Poll status
chrome.runtime.sendMessage({ type: 'get-status' }, updateStatus);

document.getElementById('open-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'open-sidebar' }, () => window.close());
  });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'force-reconnect' });
  setTimeout(() => chrome.runtime.sendMessage({ type: 'get-status' }, updateStatus), 800);
});