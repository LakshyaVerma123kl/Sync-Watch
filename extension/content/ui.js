/**
 * SyncWatch UI v2.1 — State machine sidebar + reaction overlay + drift meter.
 * New: emoji reactions panel, floating emoji burst animations,
 *      live sync-delta indicator, "Sync Now" for hosts,
 *      per-user drift chips in participants list.
 */
class SyncWatchUI {
  constructor() {
    this.state = {
      connected:    false,
      roomId:       null,
      hostId:       null,
      myId:         null,
      participants: [],
      view:         'join', // 'join' | 'room'
    };

    this.activeTab     = 'chat';
    this.typingTimeout = null;
    this.activeTypers  = new Map();
    this.driftInterval = null;
    this.el = {};

    this._build();
    this._bindEvents();
    this._syncStatus();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD
  // ══════════════════════════════════════════════════════════════════════════
  _build() {
    if (document.getElementById('syncwatch-overlay')) {
      this.el.overlay = document.getElementById('syncwatch-overlay');
      return;
    }

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
        <!-- Drift indicator: only visible in room -->
        <div class="sw-drift-bar" id="sw-drift-bar" style="display:none">
          <div class="sw-drift-label">Sync</div>
          <div class="sw-drift-indicator" id="sw-drift-indicator">
            <div class="sw-drift-fill" id="sw-drift-fill"></div>
          </div>
          <div class="sw-drift-value" id="sw-drift-value">—</div>
        </div>
      </div>

      <!-- DRM notice -->
      <div class="sw-drm-notice" id="sw-drm-notice">
        ⚠️ DRM content — Manual sync mode.
      </div>

      <!-- Tab bar -->
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
        <div class="sw-join-footer">
          Create a room and share the code with friends.<br>Everyone needs the same video open.
        </div>
      </div>

      <!-- ── CHAT PANE ── -->
      <div class="sw-pane" id="sw-pane-chat">
        <!-- Reactions bar -->
        <div class="sw-reactions-bar" id="sw-reactions-bar">
          ${['❤️','🔥','😂','👍','🤯','👏','💀','🎉','😮','😍'].map(e =>
            `<button class="sw-react-btn" data-emoji="${e}">${e}</button>`
          ).join('')}
        </div>
        <div class="sw-chat-messages" id="sw-chat-messages"></div>
        <div class="sw-typing" id="sw-typing"></div>
        <div class="sw-chat-footer">
          <input id="sw-chat-input" class="sw-chat-input"
                 placeholder="Message… (Enter to send)" autocomplete="off" />
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
            <button class="sw-copy-btn" id="sw-copy-btn" title="Copy">📋</button>
          </div>
        </div>

        <button class="sw-btn sw-btn-sync" id="sw-sync-now-btn" style="display:none">
          ⚡ Sync Everyone to My Position
        </button>
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

    // Floating open pill
    const pill = document.createElement('div');
    pill.id = 'sw-open-btn';
    pill.innerHTML = `<div class="pill-dot" id="sw-pill-dot"></div> SyncWatch`;
    document.body.appendChild(pill);

    // Buffering toast
    const buf = document.createElement('div');
    buf.id = 'sw-buffering';
    buf.innerHTML = `<div class="sw-spinner"></div> Waiting for others…`;
    document.body.appendChild(buf);

    // Toast container
    const toasts = document.createElement('div');
    toasts.id = 'sw-toast-container';
    document.body.appendChild(toasts);

    // Reaction burst container (renders on top of video)
    const burst = document.createElement('div');
    burst.id = 'sw-burst-container';
    document.body.appendChild(burst);

    // Manual sync banner
    const banner = document.createElement('div');
    banner.id = 'sw-manual-banner';
    banner.innerHTML = `<strong>Manual Sync Required</strong>
      Press <strong>Play</strong> together with your friends.`;
    document.body.appendChild(banner);

    this.el = {
      overlay,
      pill,
      pillDot:          document.getElementById('sw-pill-dot'),
      statusDot:        document.getElementById('sw-status-dot'),
      statusText:       document.getElementById('sw-status-text'),
      hostChip:         document.getElementById('sw-host-chip'),
      drmNotice:        document.getElementById('sw-drm-notice'),
      driftBar:         document.getElementById('sw-drift-bar'),
      driftFill:        document.getElementById('sw-drift-fill'),
      driftValue:       document.getElementById('sw-drift-value'),
      tabs:             document.getElementById('sw-tabs'),
      joinView:         document.getElementById('sw-join-view'),
      paneChat:         document.getElementById('sw-pane-chat'),
      paneParticipants: document.getElementById('sw-pane-participants'),
      paneControls:     document.getElementById('sw-pane-controls'),
      roomInput:        document.getElementById('sw-room-input'),
      joinBtn:          document.getElementById('sw-join-btn'),
      createBtn:        document.getElementById('sw-create-btn'),
      chatMessages:     document.getElementById('sw-chat-messages'),
      typingEl:         document.getElementById('sw-typing'),
      chatInput:        document.getElementById('sw-chat-input'),
      participantsList: document.getElementById('sw-participants-list'),
      roomDisplay:      document.getElementById('sw-room-display'),
      copyBtn:          document.getElementById('sw-copy-btn'),
      syncNowBtn:       document.getElementById('sw-sync-now-btn'),
      claimBtn:         document.getElementById('sw-claim-btn'),
      releaseBtn:       document.getElementById('sw-release-btn'),
      leaveBtn:         document.getElementById('sw-leave-btn'),
      handle:           document.getElementById('sw-tab-handle'),
      buffering:        document.getElementById('sw-buffering'),
      toastContainer:   document.getElementById('sw-toast-container'),
      burstContainer:   document.getElementById('sw-burst-container'),
      manualBanner:     document.getElementById('sw-manual-banner'),
      reactionsBar:     document.getElementById('sw-reactions-bar'),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════════════════════════════════════
  _bindEvents() {
    const { el } = this;

    el.pill.addEventListener('click',    () => this.open());
    el.handle.addEventListener('click',  () => this.close());

    el.overlay.querySelectorAll('.sw-tab').forEach(tab => {
      tab.addEventListener('click', () => this._switchTab(tab.dataset.tab));
    });

    el.joinBtn.addEventListener('click',   () => this._doJoin());
    el.createBtn.addEventListener('click', () => {
      el.roomInput.value = Math.random().toString(36).substr(2, 6).toUpperCase();
      this._doJoin();
    });
    el.roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._doJoin(); });

    el.copyBtn.addEventListener('click',     () => this._copyRoomId());
    el.roomDisplay.addEventListener('click', () => this._copyRoomId());

    el.syncNowBtn.addEventListener('click', () => {
      if (window.SyncOrchestrator) window.SyncOrchestrator.sendSyncNow();
      this._addSystemMsg('⚡ Synced everyone to your position');
    });

    el.claimBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'claim-host' } });
    });
    el.releaseBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'release-host' } });
    });

    el.leaveBtn.addEventListener('click', () => this._doLeave());

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

    // Reaction buttons
    el.reactionsBar.querySelectorAll('.sw-react-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        if (window.SyncOrchestrator) window.SyncOrchestrator.sendReaction(emoji);
        // Also show it locally immediately
        this._burstEmoji(emoji, null);
      });
    });
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
      case 'sync-state':   this._onSyncState(data);   break;
      case 'user-joined':  this._onUserJoined(data);  break;
      case 'user-left':    this._onUserLeft(data);    break;
      case 'host-changed': this._onHostChanged(data); break;
      case 'chat-message': this._onChatMsg(data);     break;
      case 'video-sync':   this._onVideoSync(data);   break;
      case 'typing-start': this._onTypingStart(data); break;
      case 'typing-stop':  this._onTypingStop(data);  break;
      case 'reaction':     this._onReaction(data);    break;
      case 'sync-now':     this._onSyncNowReceived(data); break;
      case 'error':        this._addSystemMsg(`⚠️ ${data.message}`); break;
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
    this._startDriftMeter();
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
    if (data.identity?.name) {
      clearTimeout(this.activeTypers.get(data.identity.name));
      this.activeTypers.delete(data.identity.name);
      this._renderTyping();
    }
    this._renderParticipants();
    if (data.identity) this._addSystemMsg(`${data.identity.name} left`);
  }

  _onHostChanged(data) {
    this.state.hostId = data.hostId;
    this.state.participants = this.state.participants.map(p => ({
      ...p, isHost: p.id === data.hostId,
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
    this._onTypingStop(data);
    this._appendChatMsg(data.identity, data.message, false);
  }

  _onVideoSync(data) {
    if (!data.identity) return;
    const actions = { play: '▶ played', pause: '⏸ paused', seek: '⏩ seeked' };
    const verb = actions[data.event];
    if (verb) this._addSystemMsg(`${data.identity.name} ${verb} the video`);
  }

  _onTypingStart(data) {
    const name = data.identity?.name;
    if (!name) return;
    clearTimeout(this.activeTypers.get(name));
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

  _onReaction(data) {
    this._burstEmoji(data.emoji, data.identity);
    // Small toast for reactions
    this._toast(data.identity, `${data.identity.name} reacted ${data.emoji}`);
  }

  _onSyncNowReceived(data) {
    this._addSystemMsg(`⚡ ${data.identity?.name ?? 'Host'} synced everyone`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REACTION BURST
  // ══════════════════════════════════════════════════════════════════════════
  _burstEmoji(emoji, identity) {
    const container = this.el.burstContainer;
    const count = 6 + Math.floor(Math.random() * 5);

    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'sw-burst-emoji';
      el.textContent = emoji;

      const x = 30 + Math.random() * 40; // % from left
      const vy = 60 + Math.random() * 100; // vertical distance
      const vx = (Math.random() - 0.5) * 80;
      const delay = Math.random() * 300;
      const duration = 1200 + Math.random() * 600;
      const size = 24 + Math.random() * 20;

      el.style.cssText = `
        left: ${x}%;
        bottom: 15%;
        font-size: ${size}px;
        animation-delay: ${delay}ms;
        animation-duration: ${duration}ms;
        --vx: ${vx}px;
        --vy: -${vy}px;
      `;
      container.appendChild(el);
      setTimeout(() => el.remove(), delay + duration + 100);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRIFT METER
  // ══════════════════════════════════════════════════════════════════════════
  _startDriftMeter() {
    clearInterval(this.driftInterval);
    if (!this.state.roomId || !this.state.hostId || this.state.hostId === this.state.myId) {
      this.el.driftBar.style.display = 'none';
      return;
    }

    // We can only approximate drift from the video event messages
    // Show the bar but update it on drift events from content.js
    this.el.driftBar.style.display = 'flex';
    this._updateDrift(0);
  }

  _updateDrift(deltaSeconds) {
    const abs = Math.abs(deltaSeconds);
    const pct = Math.min(abs / 5, 1); // 0–5 s maps to 0–100%
    this.el.driftFill.style.width = `${pct * 100}%`;

    if (abs < 0.5) {
      this.el.driftFill.style.background = 'var(--sw-green)';
      this.el.driftValue.textContent = '✓';
      this.el.driftValue.style.color = 'var(--sw-green)';
    } else if (abs < 2) {
      this.el.driftFill.style.background = 'var(--sw-accent)';
      this.el.driftValue.textContent = `${abs.toFixed(1)}s`;
      this.el.driftValue.style.color = 'var(--sw-accent)';
    } else {
      this.el.driftFill.style.background = 'var(--sw-red)';
      this.el.driftValue.textContent = `${abs.toFixed(1)}s`;
      this.el.driftValue.style.color = 'var(--sw-red)';
    }
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
    clearInterval(this.driftInterval);
    this.el.driftBar.style.display = 'none';
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
    if (!names.length) { this.el.typingEl.textContent = ''; return; }
    const str  = names.slice(0, 2).join(', ');
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
    this.el.tabs.style.display     = 'none';
    this._showPane('join-view');
    this.el.hostChip.style.display = 'none';
  }

  _switchToRoom() {
    this.state.view = 'room';
    this.el.tabs.style.display    = 'flex';
    this.el.roomDisplay.value     = this.state.roomId;
    this._switchTab(this.activeTab);
  }

  _showPane(id) {
    ['join-view','pane-chat','pane-participants','pane-controls'].forEach(p => {
      document.getElementById(`sw-${p}`)?.classList.remove('active');
    });
    document.getElementById(`sw-${id}`)?.classList.add('active');
  }

  _switchTab(tab) {
    if (this.state.view !== 'room') return;
    this.activeTab = tab;
    this.el.overlay.querySelectorAll('.sw-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    const map = { chat: 'pane-chat', participants: 'pane-participants', controls: 'pane-controls' };
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
            ${this._escapeHtml(p.identity.name)}${isMe ? ' <span class="sw-you-badge">you</span>' : ''}
          </div>
          <div class="sw-p-role">${isHost ? '👑 Host' : 'Viewer'}</div>
        </div>
      `;
      list.appendChild(el);
    }
  }

  _renderHostControls() {
    const isHost = this.state.hostId === this.state.myId;
    const noHost = !this.state.hostId;
    this.el.hostChip.style.display   = isHost ? 'inline-block' : 'none';
    this.el.syncNowBtn.style.display  = isHost ? 'block'        : 'none';
    this.el.claimBtn.style.display    = noHost ? 'block'        : 'none';
    this.el.releaseBtn.style.display  = isHost ? 'block'        : 'none';
    // restart drift meter if host status changed
    this._startDriftMeter();
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
        <div class="sw-msg-name" style="color:${identity.color}">${this._escapeHtml(identity.name)}</div>
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
    return String(str)
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
  // STATUS CHECK
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

window.SyncUI = new SyncWatchUI();