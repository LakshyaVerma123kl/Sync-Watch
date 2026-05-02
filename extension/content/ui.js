/**
 * SyncWatch UI v2 — State machine-driven sidebar UI.
 * Fixes: participant state drift, typing indicator leaks,
 *        host badge not hiding, tab display bugs, copy-to-clipboard.
 */
class SyncWatchUI {
  constructor() {
    // ── State ──
    this.state = {
      connected:    false,
      roomId:       null,
      hostId:       null,
      myId:         null,
      participants: [],  // [{ id, identity, isHost }]
      view:         'join', // 'join' | 'room'
    };

    this.activeTab     = 'chat';
    this.typingTimeout = null;
    this.activeTypers  = new Map(); // name → timeout id

    // ── DOM refs ──
    this.el = {};

    this._build();
    this._bindEvents();
    this._syncStatus();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD
  // ══════════════════════════════════════════════════════════════════════════
  _build() {
    // Guard: already injected
    if (document.getElementById('syncwatch-overlay')) {
      // re-acquire refs
      this.el.overlay = document.getElementById('syncwatch-overlay');
      return;
    }

    // ── Sidebar ──
    const overlay = document.createElement('div');
    overlay.id = 'syncwatch-overlay';
    overlay.innerHTML = `
      <div id="sw-tab-handle">SYNC</div>

      <!-- Header -->
      <div class="sw-header">
        <div class="sw-header-top">
          <div class="sw-logo">
            <span class="sw-logo-icon">🎬</span>SyncWatch
            <span class="sw-host-chip" id="sw-host-chip">HOST</span>
          </div>
          <div class="sw-status-badge">
            <div class="sw-status-dot" id="sw-status-dot"></div>
            <span id="sw-status-text">Offline</span>
          </div>
        </div>
      </div>

      <!-- DRM notice -->
      <div class="sw-drm-notice" id="sw-drm-notice">
        ⚠️ DRM content detected. Manual sync mode — press play at the same time.
      </div>

      <!-- Tab bar (hidden when in join view) -->
      <div class="sw-tabs" id="sw-tabs" style="display:none">
        <div class="sw-tab active" data-tab="chat">💬 Chat</div>
        <div class="sw-tab" data-tab="participants">👥 People</div>
        <div class="sw-tab" data-tab="controls">⚙️ Room</div>
      </div>

      <!-- ── JOIN VIEW ── -->
      <div class="sw-pane active sw-join-view" id="sw-join-view">
        <div>
          <div class="sw-field-label">Room ID</div>
          <input id="sw-room-input" class="sw-input" type="text"
                 placeholder="Enter room code…" spellcheck="false" autocomplete="off" />
        </div>
        <div class="sw-room-actions">
          <button class="sw-btn sw-btn-primary" id="sw-join-btn">Join</button>
          <button class="sw-btn sw-btn-secondary" id="sw-create-btn">New Room</button>
        </div>
        <div style="text-align:center;font-size:11px;color:var(--sw-text3);margin-top:auto;padding-top:20px">
          Create a room and share the code with friends.<br>Everyone needs the same video open.
        </div>
      </div>

      <!-- ── CHAT PANE ── -->
      <div class="sw-pane" id="sw-pane-chat">
        <div class="sw-chat-messages" id="sw-chat-messages"></div>
        <div class="sw-typing" id="sw-typing"></div>
        <div class="sw-chat-footer">
          <input id="sw-chat-input" class="sw-chat-input"
                 placeholder="Send a message… (Enter)" autocomplete="off" />
        </div>
      </div>

      <!-- ── PARTICIPANTS PANE ── -->
      <div class="sw-pane" id="sw-pane-participants">
        <div class="sw-participants-list" id="sw-participants-list"></div>
      </div>

      <!-- ── CONTROLS PANE ── -->
      <div class="sw-pane sw-join-view" id="sw-pane-controls">
        <div>
          <div class="sw-field-label">Room ID (click to copy)</div>
          <div class="sw-room-id-row">
            <input id="sw-room-display" class="sw-input" type="text" readonly />
            <button class="sw-copy-btn" id="sw-copy-btn" title="Copy room ID">📋</button>
          </div>
        </div>

        <button class="sw-btn sw-btn-ghost" id="sw-claim-btn" style="display:none">
          👑 Claim Host
        </button>
        <button class="sw-btn sw-btn-ghost" id="sw-release-btn" style="display:none">
          Release Host
        </button>
        <hr class="sw-divider" />
        <button class="sw-btn sw-btn-danger" id="sw-leave-btn">Leave Room</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // ── Floating open button ──
    const pill = document.createElement('div');
    pill.id = 'sw-open-btn';
    pill.innerHTML = `<div class="pill-dot" id="sw-pill-dot"></div> SyncWatch`;
    document.body.appendChild(pill);

    // ── Buffering indicator ──
    const buf = document.createElement('div');
    buf.id = 'sw-buffering';
    buf.innerHTML = `<div class="sw-spinner"></div> Waiting for others…`;
    document.body.appendChild(buf);

    // ── Toast container ──
    const toasts = document.createElement('div');
    toasts.id = 'sw-toast-container';
    document.body.appendChild(toasts);

    // ── Manual sync banner ──
    const banner = document.createElement('div');
    banner.id = 'sw-manual-banner';
    banner.innerHTML = `
      <strong>Manual Sync Required</strong>
      Press <strong>Play</strong> together with your friends.
    `;
    document.body.appendChild(banner);

    // Cache refs
    this.el = {
      overlay,
      pill,
      pillDot:       document.getElementById('sw-pill-dot'),
      statusDot:     document.getElementById('sw-status-dot'),
      statusText:    document.getElementById('sw-status-text'),
      hostChip:      document.getElementById('sw-host-chip'),
      drmNotice:     document.getElementById('sw-drm-notice'),
      tabs:          document.getElementById('sw-tabs'),
      joinView:      document.getElementById('sw-join-view'),
      paneChat:      document.getElementById('sw-pane-chat'),
      paneParticipants: document.getElementById('sw-pane-participants'),
      paneControls:  document.getElementById('sw-pane-controls'),
      roomInput:     document.getElementById('sw-room-input'),
      joinBtn:       document.getElementById('sw-join-btn'),
      createBtn:     document.getElementById('sw-create-btn'),
      chatMessages:  document.getElementById('sw-chat-messages'),
      typingEl:      document.getElementById('sw-typing'),
      chatInput:     document.getElementById('sw-chat-input'),
      participantsList: document.getElementById('sw-participants-list'),
      roomDisplay:   document.getElementById('sw-room-display'),
      copyBtn:       document.getElementById('sw-copy-btn'),
      claimBtn:      document.getElementById('sw-claim-btn'),
      releaseBtn:    document.getElementById('sw-release-btn'),
      leaveBtn:      document.getElementById('sw-leave-btn'),
      handle:        document.getElementById('sw-tab-handle'),
      buffering:     document.getElementById('sw-buffering'),
      toastContainer: document.getElementById('sw-toast-container'),
      manualBanner:  document.getElementById('sw-manual-banner'),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════════════════════════════════════
  _bindEvents() {
    const { el } = this;

    // Toggle sidebar
    el.pill.addEventListener('click',   () => this.open());
    el.handle.addEventListener('click', () => this.close());

    // Tabs
    el.overlay.querySelectorAll('.sw-tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
    });

    // Join / create
    el.joinBtn.addEventListener('click',   () => this._doJoin());
    el.createBtn.addEventListener('click', () => {
      el.roomInput.value = Math.random().toString(36).substr(2, 6);
      this._doJoin();
    });
    el.roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._doJoin(); });

    // Copy room ID
    el.copyBtn.addEventListener('click',    () => this._copyRoomId());
    el.roomDisplay.addEventListener('click', () => this._copyRoomId());

    // Host
    el.claimBtn.addEventListener('click',   () => {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'claim-host' } });
    });
    el.releaseBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'release-host' } });
    });

    // Leave
    el.leaveBtn.addEventListener('click', () => this._doLeave());

    // Chat
    el.chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const msg = el.chatInput.value.trim();
        if (!msg) return;
        this._sendChat(msg);
        el.chatInput.value = '';
        this._stopTyping();
      }
    });
    el.chatInput.addEventListener('input', () => this._startTyping());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════
  open()  { this.el.overlay.classList.add('visible');    this.el.pill.style.display = 'none'; }
  close() { this.el.overlay.classList.remove('visible'); this.el.pill.style.display = 'flex'; }

  setConnected(connected) {
    this.state.connected = connected;
    this._renderConnection();
    if (!connected && this.state.roomId) {
      this._addSystemMsg('⚡ Connection lost — reconnecting…');
    }
  }

  setBuffering(on) {
    this.el.buffering.classList.toggle('visible', on);
  }

  showManualSyncPrompt() {
    this.el.manualBanner.classList.add('visible');
    setTimeout(() => this.el.manualBanner.classList.remove('visible'), 5000);
  }

  handleServerMessage(data) {
    switch (data.type) {
      case 'sync-state':     this._onSyncState(data);    break;
      case 'user-joined':    this._onUserJoined(data);   break;
      case 'user-left':      this._onUserLeft(data);     break;
      case 'host-changed':   this._onHostChanged(data);  break;
      case 'chat-message':   this._onChatMsg(data);      break;
      case 'video-sync':     this._onVideoSync(data);    break;
      case 'typing-start':   this._onTypingStart(data);  break;
      case 'typing-stop':    this._onTypingStop(data);   break;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERVER HANDLERS
  // ══════════════════════════════════════════════════════════════════════════
  _onSyncState(data) {
    this.state.connected    = true;
    this.state.myId         = data.yourId;
    this.state.hostId       = data.hostId;
    this.state.participants = data.participants || [];
    this._renderAll();
  }

  _onUserJoined(data) {
    if (!this.state.participants.find(p => p.id === data.userId)) {
      this.state.participants.push({ id: data.userId, identity: data.identity, isHost: false });
    }
    this._renderParticipants();
    this._addSystemMsg(`${data.identity.name} joined`);
    this._toast(data.identity, `${data.identity.name} joined the room`);
  }

  _onUserLeft(data) {
    this.state.participants = this.state.participants.filter(p => p.id !== data.userId);
    // clean up typing
    if (data.identity?.name) {
      clearTimeout(this.activeTypers.get(data.identity.name));
      this.activeTypers.delete(data.identity.name);
      this._renderTyping();
    }
    this._renderParticipants();
    if (data.identity) {
      this._addSystemMsg(`${data.identity.name} left`);
    }
  }

  _onHostChanged(data) {
    this.state.hostId = data.hostId;
    this.state.participants = this.state.participants.map(p => ({
      ...p,
      isHost: p.id === data.hostId,
    }));
    this._renderParticipants();
    this._renderHostControls();

    if (data.hostId === this.state.myId) {
      this._toast(null, '👑 You are now the Host');
    } else if (data.identity) {
      this._toast({ color: '#e8b86d', initial: '👑' }, `${data.identity.name} is now Host`);
    } else {
      this._addSystemMsg('Host released — anyone can claim');
    }
  }

  _onChatMsg(data) {
    this._onTypingStop(data); // clear their typing indicator
    this._appendChatMsg(data.identity, data.message, false);
  }

  _onVideoSync(data) {
    if (!data.identity) return;
    const actions = { play:'▶ played', pause:'⏸ paused', seek:'⏩ seeked' };
    const verb = actions[data.event];
    if (verb) this._addSystemMsg(`${data.identity.name} ${verb} the video`);
  }

  _onTypingStart(data) {
    const name = data.identity?.name;
    if (!name) return;
    clearTimeout(this.activeTypers.get(name));
    // auto-expire after 4 s (safety net)
    const tid = setTimeout(() => {
      this.activeTypers.delete(name);
      this._renderTyping();
    }, 4000);
    this.activeTypers.set(name, tid);
    this._renderTyping();
  }

  _onTypingStop(data) {
    const name = data.identity?.name;
    if (!name) return;
    clearTimeout(this.activeTypers.get(name));
    this.activeTypers.delete(name);
    this._renderTyping();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROOM ACTIONS
  // ══════════════════════════════════════════════════════════════════════════
  _doJoin() {
    const roomId = this.el.roomInput.value.trim().toLowerCase();
    if (!roomId) { this.el.roomInput.focus(); return; }
    this.state.roomId = roomId;
    this._switchToRoom();
    if (window.SyncOrchestrator) window.SyncOrchestrator.setRoom(roomId);

    // Show DRM notice if needed
    if (window.SyncOrchestrator?.isDRM?.()) {
      this.el.drmNotice.style.display = 'block';
    }
  }

  _doLeave() {
    this.state.roomId       = null;
    this.state.hostId       = null;
    this.state.participants = [];
    this.el.chatMessages.innerHTML = '';
    this.activeTypers.clear();
    this._renderTyping();
    this._switchToJoin();
    if (window.SyncOrchestrator) window.SyncOrchestrator.setRoom(null);
    this.el.drmNotice.style.display = 'none';
  }

  _sendChat(message) {
    const me = this.state.participants.find(p => p.id === this.state.myId);
    const identity = me?.identity ?? { name: 'You', color: '#e8b86d', initial: 'Y' };
    this._appendChatMsg(identity, message, true);
    chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'chat-message', message } });
  }

  _copyRoomId() {
    const id = this.state.roomId;
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      this.el.copyBtn.textContent = '✅';
      setTimeout(() => { this.el.copyBtn.textContent = '📋'; }, 2000);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TYPING
  // ══════════════════════════════════════════════════════════════════════════
  _startTyping() {
    if (!this.typingTimeout) {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'typing-start' } });
    }
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this._stopTyping(), 2500);
  }

  _stopTyping() {
    clearTimeout(this.typingTimeout);
    this.typingTimeout = null;
    chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'typing-stop' } });
  }

  _renderTyping() {
    const names = Array.from(this.activeTypers.keys());
    if (!names.length) {
      this.el.typingEl.textContent = '';
      return;
    }
    const str = names.slice(0, 2).join(', ');
    const more = names.length > 2 ? ' +more' : '';
    const verb = names.length > 1 ? 'are' : 'is';
    this.el.typingEl.textContent = `${str}${more} ${verb} typing…`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  _renderAll() {
    this._renderConnection();
    if (this.state.roomId) {
      this._switchToRoom();
    } else {
      this._switchToJoin();
    }
    this._renderParticipants();
    this._renderHostControls();
  }

  _renderConnection() {
    const on = this.state.connected;
    this.el.statusDot.classList.toggle('on', on);
    this.el.statusText.textContent = on ? 'Connected' : 'Offline';
    this.el.pillDot.classList.toggle('connected', on);
  }

  _switchToJoin() {
    this.state.view = 'join';
    this.el.tabs.style.display       = 'none';
    this._showPane('join-view');
    this.el.hostChip.style.display   = 'none';
  }

  _switchToRoom() {
    this.state.view = 'room';
    this.el.tabs.style.display       = 'flex';
    this.el.roomDisplay.value        = this.state.roomId;
    this._switchTab(this.activeTab);
  }

  _showPane(id) {
    ['join-view','pane-chat','pane-participants','pane-controls'].forEach(p => {
      const el = document.getElementById(`sw-${p}`);
      if (el) el.classList.remove('active');
    });
    const target = document.getElementById(`sw-${id}`);
    if (target) target.classList.add('active');
  }

  _switchTab(tab) {
    if (this.state.view !== 'room') return;
    this.activeTab = tab;

    this.el.overlay.querySelectorAll('.sw-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    const map = { chat:'pane-chat', participants:'pane-participants', controls:'pane-controls' };
    this._showPane(map[tab] ?? 'pane-chat');
  }

  _renderParticipants() {
    const list = this.el.participantsList;
    list.innerHTML = '';

    for (const p of this.state.participants) {
      const isMe   = p.id === this.state.myId;
      const isHost = p.id === this.state.hostId;

      const el = document.createElement('div');
      el.className = 'sw-participant';
      el.innerHTML = `
        <div class="sw-p-avatar" style="background:${p.identity.color}">${p.identity.initial}</div>
        <div class="sw-p-info">
          <div class="sw-p-name" style="color:${p.identity.color}">
            ${p.identity.name}${isMe ? ' (you)' : ''}
          </div>
          <div class="sw-p-role">${isHost ? 'Host' : 'Viewer'}</div>
        </div>
        ${isHost ? '<span class="sw-p-crown">👑</span>' : ''}
      `;
      list.appendChild(el);
    }
  }

  _renderHostControls() {
    const isHost    = this.state.hostId === this.state.myId;
    const noHost    = !this.state.hostId;
    this.el.hostChip.style.display   = isHost   ? 'inline-block' : 'none';
    this.el.claimBtn.style.display   = noHost   ? 'block'  : 'none';
    this.el.releaseBtn.style.display = isHost   ? 'block'  : 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT
  // ══════════════════════════════════════════════════════════════════════════
  _appendChatMsg(identity, text, isOwn) {
    const el = document.createElement('div');
    el.className = `sw-msg${isOwn ? ' own' : ''}`;
    el.innerHTML = `
      <div class="sw-msg-avatar" style="background:${identity.color}">${identity.initial}</div>
      <div class="sw-msg-body">
        <div class="sw-msg-name" style="color:${identity.color}">${identity.name}</div>
        <div class="sw-msg-bubble">${this._escapeHtml(text)}</div>
      </div>
    `;
    this.el.chatMessages.appendChild(el);
    this.el.chatMessages.scrollTop = this.el.chatMessages.scrollHeight;
  }

  _addSystemMsg(text) {
    const el = document.createElement('div');
    el.className = 'sw-system-msg';
    el.textContent = text;
    this.el.chatMessages.appendChild(el);
    this.el.chatMessages.scrollTop = this.el.chatMessages.scrollHeight;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOASTS
  // ══════════════════════════════════════════════════════════════════════════
  _toast(identity, text) {
    const el = document.createElement('div');
    el.className = 'sw-toast';
    if (identity) {
      el.innerHTML = `<div class="sw-toast-avatar" style="background:${identity.color}">${identity.initial}</div>${this._escapeHtml(text)}`;
    } else {
      el.textContent = text;
    }
    this.el.toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS CHECK (on load)
  // ══════════════════════════════════════════════════════════════════════════
  _syncStatus() {
    chrome.runtime.sendMessage({ type: 'get-status' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.connected) this.state.connected = true;
      if (res?.room)      this.state.roomId    = res.room;
      if (res?.myId)      this.state.myId      = res.myId;
      this._renderAll();
    });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────
window.SyncUI = new SyncWatchUI();