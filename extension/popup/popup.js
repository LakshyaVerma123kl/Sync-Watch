const dot         = document.getElementById('dot');
const statusTx    = document.getElementById('status-text');
const roomInfo    = document.getElementById('room-info');
const roomId      = document.getElementById('room-id');
const serverBadge = document.getElementById('server-badge');
const roomMembers = document.getElementById('room-members');

function updateStatus(res) {
  if (!res) { statusTx.textContent = 'Extension error'; return; }
  const on = res.connected;
  dot.classList.toggle('on', on);
  statusTx.textContent = on ? 'Connected to Sync Server' : 'Server offline';
  
  if (serverBadge) {
    serverBadge.style.display = on ? 'inline-flex' : 'none';
  }

  if (res.room) {
    roomInfo.classList.add('show');
    roomId.textContent = res.room.toUpperCase();
    
    // Request member count from content script
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'get-room-info' }, (info) => {
          if (chrome.runtime.lastError) {
             roomMembers.textContent = 'Open panel to view members';
             return;
          }
          if (info && info.members) {
            roomMembers.textContent = `${info.members} person(s) in room`;
          } else {
            roomMembers.textContent = 'In room';
          }
        });
      }
    });
  } else {
    roomInfo.classList.remove('show');
  }
}

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