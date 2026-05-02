/**
 * SyncWatch Content Script — orchestrates adapter + UI + server messages.
 */

let activeAdapter = null;
let currentRoom   = null;
let myId          = null;
let hostId        = null;
let isDRM         = false;

// ── Adapter Initialisation ────────────────────────────────────────────────────
function initAdapter() {
  const h = window.location.hostname;

  if (h.includes('netflix.com') || h.includes('primevideo.com') || h.includes('disneyplus.com')) {
    activeAdapter = new window.NetflixAdapter();
    isDRM = true;
  } else if (h.includes('youtube.com')) {
    activeAdapter = new window.YouTubeAdapter();
  } else {
    activeAdapter = new window.GenericAdapter();
  }

  activeAdapter.init({
    onPlay:         (t) => sendEvent('play',                t),
    onPause:        (t) => sendEvent('pause',               t),
    onSeek:         (t) => sendEvent('seek',                t),
    onWaiting:      (t) => sendEvent('waiting',             t),
    onPlaying:      (t) => sendEvent('buffering-recovered', t),
    onDrift:        (t) => sendEvent('drift',               t),
    onManualAction: (action, t) => {
      if (window.SyncUI) window.SyncUI.showManualSyncPrompt(action, t);
    },
  });
}

// ── Server Communication ──────────────────────────────────────────────────────
function sendEvent(event, time) {
  if (!currentRoom) return;
  chrome.runtime.sendMessage({
    type: 'to-server',
    data: { type: 'video-event', roomId: currentRoom, event, time },
  });
}

// ── Message Listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // ── Connection status ──
  if (message.type === 'connection-status') {
    if (window.SyncUI) window.SyncUI.setConnected(message.connected);
    return;
  }

  // ── Open sidebar from popup ──
  if (message.type === 'open-sidebar') {
    if (window.SyncUI) window.SyncUI.open();
    sendResponse({ success: true });
    return true;
  }

  // ── Server messages ──
  if (message.type !== 'from-server') return;
  const data = message.data;

  // Dispatch to UI
  if (window.SyncUI) window.SyncUI.handleServerMessage(data);

  // ── Video sync ──
  if (data.type === 'video-sync' && activeAdapter && !isDRM) {
    const { event, time } = data;

    if (event === 'play' || event === 'buffering-recovered') {
      if (window.SyncUI) window.SyncUI.setBuffering(false);
      if (time !== undefined) activeAdapter.seek(time);
      activeAdapter.play();
    } else if (event === 'pause' || event === 'waiting') {
      if (event === 'waiting' && window.SyncUI) window.SyncUI.setBuffering(true);
      if (time !== undefined) activeAdapter.seek(time);
      activeAdapter.pause();
    } else if (event === 'seek') {
      if (time !== undefined) activeAdapter.seek(time);
    } else if (event === 'drift') {
      // Soft correction: only nudge if we're more than 2 s off
      if (time !== undefined && Math.abs(activeAdapter.getCurrentTime() - time) > 2) {
        activeAdapter.seek(time);
      }
    }
  }

  // ── Initial sync on join ──
  if (data.type === 'sync-state' && activeAdapter && !isDRM) {
    myId   = data.yourId;
    hostId = data.hostId;
    _updateLock();

    if (data.state.time) activeAdapter.seek(data.state.time);
    if (data.state.playing) {
      activeAdapter.play();
    } else {
      activeAdapter.pause();
    }
  }

  // ── Host changes ──
  if (data.type === 'host-changed') {
    hostId = data.hostId;
    _updateLock();
  }
});

function _updateLock() {
  if (!activeAdapter) return;
  // Lock controls if there's a host AND it's not us
  activeAdapter.lockControls(!!(hostId && hostId !== myId));
}

// ── Room Management ───────────────────────────────────────────────────────────
window.SyncOrchestrator = {
  setRoom(roomId) {
    currentRoom = roomId;
    if (roomId) {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'join-room', roomId } });
    } else {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'leave-room' } });
    }
  },
  isDRM: () => isDRM,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdapter);
} else {
  initAdapter();
}