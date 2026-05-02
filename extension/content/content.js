/**
 * SyncWatch Content Script v3.1
 * Orchestrates adapter + UI + server messages.
 * Fix: Wrap all chrome.runtime calls in try/catch for invalidated context.
 */

let activeAdapter = null;
let currentRoom   = null;
let myId          = null;
let hostId        = null;
let isDRM         = false;

// ── Safe chrome.runtime wrapper ───────────────────────────────────────────────
function safeSendMessage(message, callback) {
  try {
    if (!chrome?.runtime?.id) return; // Extension context invalidated
    chrome.runtime.sendMessage(message, callback);
  } catch (e) {
    if (e.message?.includes('Extension context invalidated')) {
      // Silently ignore — extension was reloaded/updated
      console.warn('[SyncWatch] Extension context invalidated, ignoring message.');
    } else {
      console.error('[SyncWatch] sendMessage error:', e);
    }
  }
}

// ── Adapter Init ──────────────────────────────────────────────────────────────
function initAdapter() {
  const h = window.location.hostname;

  if (h.includes('netflix.com') || h.includes('primevideo.com') || h.includes('disneyplus.com') || h.includes('hulu.com') || h.includes('max.com') || h.includes('peacocktv.com') || h.includes('paramountplus.com') || h.includes('appletvplus.com') || h.includes('apple.com/apple-tv-plus')) {
    activeAdapter = new window.NetflixAdapter();
    isDRM = true;
  } else if (h.includes('youtube.com') || h.includes('youtu.be')) {
    activeAdapter = new window.YouTubeAdapter();
  } else {
    activeAdapter = new window.GenericAdapter();
  }

  activeAdapter.init({
    onPlay:         (t) => sendEvent('play',               t),
    onPause:        (t) => sendEvent('pause',              t),
    onSeek:         (t) => sendEvent('seek',               t),
    onWaiting:      (t) => sendEvent('waiting',            t),
    onPlaying:      (t) => sendEvent('buffering-recovered',t),
    onDrift:        (t) => sendEvent('drift',              t),
    onManualAction: (action, t) => {
      if (window.SyncUI) window.SyncUI.showManualSyncPrompt(action, t);
    },
  });
}

// ── Server Communication ──────────────────────────────────────────────────────
function sendEvent(event, time) {
  if (!currentRoom) return;
  safeSendMessage({
    type: 'to-server',
    data: { type: 'video-event', roomId: currentRoom, event, time },
  });
}

// ── Message Listener ──────────────────────────────────────────────────────────
try {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'connection-status') {
      if (window.SyncUI) window.SyncUI.setConnected(message.connected);
      return;
    }

    if (message.type === 'open-sidebar') {
      if (window.SyncUI) window.SyncUI.openPanel();
      sendResponse({ success: true });
      return true;
    }

    if (message.type !== 'from-server') return;
    const data = message.data;

    if (window.SyncUI) window.SyncUI.handleServerMessage(data);

    // ── Video sync ──────────────────────────────────────────────────────────────
    if (data.type === 'video-sync' && activeAdapter && !isDRM) {
      const { event, time, playing } = data;

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
        if (playing === true)        activeAdapter.play();
        else if (playing === false)  activeAdapter.pause();

      } else if (event === 'drift') {
        if (time !== undefined) {
          const delta = activeAdapter.getCurrentTime() - time;
          if (window.SyncUI) window.SyncUI.updateDrift(delta);
          if (Math.abs(delta) > 2) activeAdapter.seek(time);
        }
      }
    }

    // ── sync-now ────────────────────────────────────────────────────────────────
    if (data.type === 'sync-now' && activeAdapter && !isDRM) {
      if (data.time !== undefined) activeAdapter.seek(data.time);
      if (data.playing) activeAdapter.play(); else activeAdapter.pause();
    }

    // ── Initial sync on join ────────────────────────────────────────────────────
    if (data.type === 'sync-state') {
      myId   = data.yourId;
      hostId = data.hostId;
      _updateLock();
      if (activeAdapter && !isDRM) {
        if (data.state.time > 0) activeAdapter.seek(data.state.time);
        if (data.state.playing) activeAdapter.play(); else activeAdapter.pause();
      }
    }

    // ── Host changes ────────────────────────────────────────────────────────────
    if (data.type === 'host-changed') {
      hostId = data.hostId;
      _updateLock();
    }
  });
} catch (e) {
  console.warn('[SyncWatch] Could not add message listener:', e);
}

function _updateLock() {
  if (!activeAdapter) return;
  activeAdapter.lockControls(!!(hostId && hostId !== myId));
}

// ── Room Management ───────────────────────────────────────────────────────────
window.SyncOrchestrator = {
  setRoom(roomId) {
    currentRoom = roomId;
    if (roomId) {
      safeSendMessage({ type: 'to-server', data: { type: 'join-room', roomId } });
    } else {
      safeSendMessage({ type: 'to-server', data: { type: 'leave-room' } });
    }
  },
  isDRM:          () => isDRM,
  sendReaction:   (emoji) => {
    if (!currentRoom) return;
    safeSendMessage({ type: 'to-server', data: { type: 'reaction', emoji } });
  },
  sendSyncNow:    () => {
    if (!currentRoom) return;
    if (activeAdapter) {
      const time = activeAdapter.getCurrentTime();
      safeSendMessage({
        type: 'to-server',
        data: { type: 'video-event', event: activeAdapter.isPaused() ? 'pause' : 'play', time },
      });
    }
    safeSendMessage({ type: 'to-server', data: { type: 'sync-now' } });
  },
  getCurrentTime: () => activeAdapter?.getCurrentTime() ?? 0,
  isPaused:       () => activeAdapter?.isPaused() ?? true,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdapter);
} else {
  initAdapter();
}