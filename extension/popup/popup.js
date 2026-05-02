const dot         = document.getElementById('dot');
const statusTx    = document.getElementById('status-text');
const roomInfo    = document.getElementById('room-info');
const roomId      = document.getElementById('room-id');
const roomMembers = document.getElementById('room-members');
const openBtn     = document.getElementById('open-btn');
const shareBtn    = document.getElementById('share-btn');
const refreshBtn  = document.getElementById('refresh-btn');

let currentRoomId = null;

function updateStatus(res) {
  if (!res) { 
    statusTx.textContent = 'Error'; 
    return; 
  }
  
  const on = res.connected;
  dot.classList.toggle('on', on);
  statusTx.textContent = on ? 'Connected' : 'Offline';
  
  if (res.room) {
    currentRoomId = res.room;
    roomInfo.classList.add('show');
    roomId.textContent = res.room.toUpperCase();
    shareBtn.classList.add('show');
    
    // Request member count from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'get-room-info' }, (info) => {
          if (chrome.runtime.lastError) {
             roomMembers.textContent = 'In room';
             return;
          }
          if (info && info.members) {
            roomMembers.textContent = `${info.members} Member${info.members > 1 ? 's' : ''}`;
          } else {
            roomMembers.textContent = 'In room';
          }
        });
      }
    });
  } else {
    currentRoomId = null;
    roomInfo.classList.remove('show');
    shareBtn.classList.remove('show');
  }
}

// Initial status check
chrome.runtime.sendMessage({ type: 'get-status' }, updateStatus);

// Open cinema panel
openBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'open-sidebar' }, () => window.close());
  });
});

// Generate and copy share link
shareBtn.addEventListener('click', () => {
  if (!currentRoomId) return;
  
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    
    const currentUrl = tab.url.split('?')[0];
    const shareUrl = `${currentUrl}?sw_room=${encodeURIComponent(currentRoomId)}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      const originalText = shareBtn.textContent;
      shareBtn.textContent = '✓ Copied to Clipboard';
      shareBtn.style.background = 'rgba(0,229,160,0.15)';
      shareBtn.style.color = 'var(--green)';
      
      setTimeout(() => {
        shareBtn.textContent = originalText;
        shareBtn.style.background = '';
        shareBtn.style.color = '';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  });
});

// Reconnect
refreshBtn.addEventListener('click', (e) => {
  e.preventDefault();
  refreshBtn.style.opacity = '0.5';
  chrome.runtime.sendMessage({ type: 'force-reconnect' });
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'get-status' }, updateStatus);
    refreshBtn.style.opacity = '1';
  }, 800);
});