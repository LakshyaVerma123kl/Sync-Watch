let activeAdapter = null;
let currentRoom = null;

function initializeAdapter() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('youtube.com')) {
    activeAdapter = new window.YouTubeAdapter();
  } else {
    activeAdapter = new window.GenericAdapter();
  }

  activeAdapter.init({
    onPlay: (time) => sendEvent('play', time),
    onPause: (time) => sendEvent('pause', time),
    onSeek: (time) => sendEvent('seek', time),
    onWaiting: (time) => sendEvent('waiting', time),
    onPlaying: (time) => sendEvent('buffering-recovered', time)
  });
}

function sendEvent(event, time) {
  if (!currentRoom) return;
  chrome.runtime.sendMessage({
    type: 'to-server',
    data: {
      type: 'video-event',
      roomId: currentRoom,
      event,
      time
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'from-server') {
    const data = message.data;
    
    if (data.type === 'video-sync' && activeAdapter) {
      if (data.event === 'play' || data.event === 'buffering-recovered') {
        if (window.SyncUI) window.SyncUI.setBuffering(false);
        activeAdapter.play();
      }
      if (data.event === 'pause' || data.event === 'waiting') {
        if (data.event === 'waiting' && window.SyncUI) {
          window.SyncUI.setBuffering(true);
        }
        activeAdapter.pause();
      }
      if (data.time !== undefined) activeAdapter.seek(data.time);
    }
    
    if (data.type === 'sync-state' && activeAdapter) {
      activeAdapter.seek(data.state.time);
      if (data.state.playing) {
        activeAdapter.play();
      } else {
        activeAdapter.pause();
      }
      
      // Initial host lock sync
      updateAdapterLock(data.hostId, window.SyncUI ? window.SyncUI.state.myId : null);
    }

    if (data.type === 'host-changed' && activeAdapter) {
       updateAdapterLock(data.hostId, window.SyncUI ? window.SyncUI.state.myId : null);
    }
    
    if (window.SyncUI) {
      window.SyncUI.handleServerMessage(data);
    }
  }

  if (message.type === 'open-sidebar') {
    if (window.SyncUI && window.SyncUI.container) {
      window.SyncUI.container.classList.remove('minimized');
      const btn = window.SyncUI.container.querySelector('#sw-toggle');
      if (btn) btn.textContent = '▶';
    }
    sendResponse({ success: true });
  }
});

function updateAdapterLock(hostId, myId) {
  if (!activeAdapter) return;
  if (hostId && hostId !== myId) {
    activeAdapter.lockControls(true);
  } else {
    activeAdapter.lockControls(false);
  }
}

window.SyncOrchestrator = {
  setRoom: (roomId) => {
    currentRoom = roomId;
    if (roomId) {
      chrome.runtime.sendMessage({
        type: 'to-server',
        data: { type: 'join-room', roomId: currentRoom }
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'to-server',
        data: { type: 'leave-room' }
      });
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAdapter);
} else {
  initializeAdapter();
}
