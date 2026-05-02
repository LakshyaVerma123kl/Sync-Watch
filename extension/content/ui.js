/**
 * SyncWatch UI v3.1
 * - Draggable mini/collapsed mode
 * - Share link button
 * - Improved visual design
 * - Extension context error safety
 */

// Safe chrome.runtime wrapper
function safeSendMsg(message, callback) {
  try {
    if (!chrome?.runtime?.id) return;
    if (callback) chrome.runtime.sendMessage(message, callback);
    else chrome.runtime.sendMessage(message);
  } catch (e) {
    console.warn('[SyncWatch UI] sendMessage error:', e.message);
  }
}

class SyncWatchUI {
  constructor() {
    this.state = {
      connected:    false,
      roomId:       null,
      hostId:       null,
      myId:         null,
      participants: [],
      view:         'join',
      playing:      false,
    };

    this.activeTab     = 'chat';
    this.typingTimeout = null;
    this.activeTypers  = new Map();
    this._timeInterval = null;
    this._peekTimeout  = null;
    this.el            = {};
    this.panelOpen     = false;
    this.miniMode      = false;
    this.peekMsgs      = [];

    // Draggable mini state
    this._drag = { active: false, startY: 0, startTop: 0 };

    this._build();
    this._bindEvents();
    this._syncStatus();
    this._startTimeUpdater();
  }

  // ══════════════════════════════════════════════════════
  // BUILD DOM
  // ══════════════════════════════════════════════════════
  _build() {
    document.getElementById('sw-root')?.remove();
    document.getElementById('sw-launcher')?.remove();
    document.getElementById('sw-buf')?.remove();
    document.getElementById('sw-toasts')?.remove();
    document.getElementById('sw-burst')?.remove();
    document.getElementById('sw-manual')?.remove();
    document.getElementById('sw-peek')?.remove();

    const root = document.createElement('div');
    root.id = 'sw-root';
    root.innerHTML = `
      <div id="sw-panel">
        <div id="sw-edge-handle" title="Collapse">
          <div class="sw-handle-pip"></div>
          <div class="sw-handle-pip"></div>
        </div>

        <!-- Mini rail (collapsed mode) -->
        <div id="sw-mini-rail">
          <div class="sw-drag-handle" id="sw-drag-handle" title="Drag to move">
            <div class="sw-drag-dots">
              <span></span><span></span>
              <span></span><span></span>
              <span></span><span></span>
            </div>
          </div>
          <button class="sw-rail-btn" id="sw-rail-expand" title="Expand">◀</button>
          <button class="sw-rail-btn" id="sw-rail-chat" title="Chat">💬<span class="sw-rail-badge" id="sw-chat-badge"></span></button>
          <button class="sw-rail-btn" id="sw-rail-people" title="People">👥</button>
          <button class="sw-rail-btn" id="sw-rail-room" title="Room">⚙</button>
          <button class="sw-rail-btn" id="sw-rail-leave" title="Leave room" style="color:var(--red)">✕</button>
        </div>

        <!-- HEADER -->
        <div id="sw-header">
          <div class="sw-header-row1">
            <div class="sw-logo">
              <div class="sw-logo-mark">🎬</div>
              SyncWatch
              <span class="sw-logo-version">v3.1</span>
            </div>
            <div class="sw-header-actions">
              <div class="sw-host-badge" id="sw-host-badge">HOST</div>
              <button class="sw-icon-btn" id="sw-mini-btn" title="Collapse sidebar">◀</button>
              <button class="sw-icon-btn" id="sw-close-btn" title="Hide">✕</button>
            </div>
          </div>
          <div class="sw-connection-row">
            <div class="sw-conn-badge">
              <div class="sw-dot" id="sw-dot"></div>
              <span id="sw-conn-text">Offline</span>
            </div>
          </div>
          <div class="sw-drift" id="sw-drift">
            <div class="sw-drift-lbl">Sync</div>
            <div class="sw-drift-track"><div class="sw-drift-fill" id="sw-drift-fill"></div></div>
            <div class="sw-drift-val" id="sw-drift-val">—</div>
          </div>
          <div class="sw-drm-notice" id="sw-drm"></div>
        </div>

        <!-- TAB BAR -->
        <div id="sw-tabs">
          <button class="sw-tab active" data-tab="chat">💬 Chat</button>
          <button class="sw-tab" data-tab="people">👥 People</button>
          <button class="sw-tab" data-tab="room">⚙ Room</button>
        </div>

        <!-- MAIN CONTENT -->
        <div id="sw-main-content">

          <!-- JOIN PANE -->
          <div class="sw-pane active" id="sw-pane-join">
            <div class="sw-join-hero">
              <div class="sw-join-hero-icon">🎬</div>
              <h2>Watch Together</h2>
              <p>Real-time sync with friends.<br>YouTube, Netflix, Prime &amp; more.</p>
            </div>
            <div class="sw-feature-chips">
              <div class="sw-chip"><div class="sw-chip-dot"></div>Real-time sync</div>
              <div class="sw-chip"><div class="sw-chip-dot"></div>Host lock</div>
              <div class="sw-chip"><div class="sw-chip-dot"></div>Live chat</div>
              <div class="sw-chip"><div class="sw-chip-dot"></div>Auto-reconnect</div>
            </div>
            <div class="sw-field">
              <div class="sw-label">Room Code</div>
              <input id="sw-room-input" class="sw-input" type="text"
                     placeholder="Enter room code…" spellcheck="false"
                     autocomplete="off" maxlength="32" />
            </div>
            <div class="sw-btn-row">
              <button class="sw-btn sw-btn-primary" id="sw-join-btn">⚡ Join Room</button>
              <button class="sw-btn sw-btn-secondary" id="sw-create-btn">✦ New Room</button>
            </div>
            <hr class="sw-divider">
            <div class="sw-join-footer">
              Create a room → share the code → open the same video → sync starts instantly.
            </div>
          </div>

          <!-- CHAT PANE -->
          <div class="sw-pane" id="sw-pane-chat">
            <div class="sw-reactions" id="sw-reactions">
              ${['❤️','🔥','😂','👍','🤯','👏','💀','🎉','😮','😍','🚀','✨'].map(e =>
                `<button class="sw-react" data-emoji="${e}">${e}</button>`
              ).join('')}
            </div>
            <div class="sw-messages" id="sw-messages"></div>
            <div class="sw-typing-row" id="sw-typing"></div>
            <div class="sw-chat-footer">
              <div class="sw-chat-input-wrap">
                <input id="sw-chat-input" class="sw-chat-input" placeholder="Message…"
                       autocomplete="off" maxlength="500" />
                <button class="sw-send-btn" id="sw-send-btn">➤</button>
              </div>
            </div>
          </div>

          <!-- PEOPLE PANE -->
          <div class="sw-pane" id="sw-pane-people">
            <div class="sw-people-list" id="sw-people"></div>
          </div>

          <!-- ROOM PANE -->
          <div class="sw-pane" id="sw-pane-room">

            <div class="sw-room-id-block">
              <div class="sw-room-id-label">Room ID</div>
              <div class="sw-room-id-row">
                <div class="sw-room-id-val" id="sw-room-val">—</div>
                <button class="sw-copy-btn" id="sw-copy-btn">Copy</button>
              </div>
            </div>

            <!-- Share link block -->
            <div class="sw-share-block" id="sw-share-block">
              <div class="sw-share-label">🔗 Invite Link</div>
              <div class="sw-share-url-row">
                <div class="sw-share-url" id="sw-share-url">—</div>
                <button class="sw-share-copy-btn" id="sw-share-copy-btn">Copy</button>
              </div>
              <div class="sw-share-desc">Share this link — friends open it to auto-join your room on the same page.</div>
            </div>

            <!-- Live video clock -->
            <div class="sw-video-block" id="sw-video-block">
              <div class="sw-video-time">
                <div class="sw-time-display" id="sw-time-display">—:——</div>
                <div class="sw-play-state paused" id="sw-play-state">Paused</div>
              </div>
              <div class="sw-video-controls">
                <button class="sw-btn sw-btn-sync sw-btn-sm" id="sw-sync-now-btn" style="display:none">⚡ Sync Everyone Now</button>
              </div>
            </div>

            <button class="sw-btn sw-btn-share" id="sw-share-btn">🔗 Get Invite Link</button>
            <button class="sw-btn sw-btn-ghost" id="sw-claim-btn">👑 Claim Host</button>
            <button class="sw-btn sw-btn-ghost" id="sw-release-btn" style="display:none">Release Host</button>
            <hr class="sw-divider">
            <button class="sw-btn sw-btn-danger" id="sw-leave-btn">Leave Room</button>
          </div>

        </div>
      </div>
    `;
    document.documentElement.appendChild(root);

    // ── Launcher ────────────────────────────────────────
    const launcher = document.createElement('div');
    launcher.id = 'sw-launcher';
    launcher.innerHTML = `
      <div class="sw-launcher-icon">🎬</div>
      <div class="sw-launcher-text">
        <span class="sw-launcher-title">SyncWatch</span>
        <span class="sw-launcher-sub">Watch together</span>
      </div>
      <div class="sw-status-pip" id="sw-pip"></div>
    `;
    document.documentElement.appendChild(launcher);

    // ── Floating overlays ───────────────────────────────
    const buf = document.createElement('div');
    buf.id = 'sw-buf';
    buf.innerHTML = `<div class="sw-spin"></div> Waiting for others…`;
    document.documentElement.appendChild(buf);

    const toasts = document.createElement('div');
    toasts.id = 'sw-toasts';
    document.documentElement.appendChild(toasts);

    const burst = document.createElement('div');
    burst.id = 'sw-burst';
    document.documentElement.appendChild(burst);

    const manual = document.createElement('div');
    manual.id = 'sw-manual';
    manual.innerHTML = `<strong>Manual Sync</strong><span>Press <strong>Play</strong> together with your friends.</span>`;
    document.documentElement.appendChild(manual);

    const peek = document.createElement('div');
    peek.id = 'sw-peek';
    document.documentElement.appendChild(peek);

    // ── Cache refs ──────────────────────────────────────
    this.el = {
      root, launcher,
      panel:         root.querySelector('#sw-panel'),
      dot:           root.querySelector('#sw-dot'),
      connText:      root.querySelector('#sw-conn-text'),
      hostBadge:     root.querySelector('#sw-host-badge'),
      drift:         root.querySelector('#sw-drift'),
      driftFill:     root.querySelector('#sw-drift-fill'),
      driftVal:      root.querySelector('#sw-drift-val'),
      drm:           root.querySelector('#sw-drm'),
      tabs:          root.querySelector('#sw-tabs'),
      paneJoin:      root.querySelector('#sw-pane-join'),
      paneChat:      root.querySelector('#sw-pane-chat'),
      panePeople:    root.querySelector('#sw-pane-people'),
      paneRoom:      root.querySelector('#sw-pane-room'),
      roomInput:     root.querySelector('#sw-room-input'),
      joinBtn:       root.querySelector('#sw-join-btn'),
      createBtn:     root.querySelector('#sw-create-btn'),
      messages:      root.querySelector('#sw-messages'),
      typing:        root.querySelector('#sw-typing'),
      chatInput:     root.querySelector('#sw-chat-input'),
      sendBtn:       root.querySelector('#sw-send-btn'),
      people:        root.querySelector('#sw-people'),
      roomVal:       root.querySelector('#sw-room-val'),
      copyBtn:       root.querySelector('#sw-copy-btn'),
      timeDisplay:   root.querySelector('#sw-time-display'),
      playState:     root.querySelector('#sw-play-state'),
      videoBlock:    root.querySelector('#sw-video-block'),
      syncNowBtn:    root.querySelector('#sw-sync-now-btn'),
      claimBtn:      root.querySelector('#sw-claim-btn'),
      releaseBtn:    root.querySelector('#sw-release-btn'),
      leaveBtn:      root.querySelector('#sw-leave-btn'),
      shareBtn:      root.querySelector('#sw-share-btn'),
      shareBlock:    root.querySelector('#sw-share-block'),
      shareUrl:      root.querySelector('#sw-share-url'),
      shareCopyBtn:  root.querySelector('#sw-share-copy-btn'),
      edgeHandle:    root.querySelector('#sw-edge-handle'),
      miniBtn:       root.querySelector('#sw-mini-btn'),
      closeBtn:      root.querySelector('#sw-close-btn'),
      miniRail:      root.querySelector('#sw-mini-rail'),
      dragHandle:    root.querySelector('#sw-drag-handle'),
      railExpand:    root.querySelector('#sw-rail-expand'),
      railChat:      root.querySelector('#sw-rail-chat'),
      railPeople:    root.querySelector('#sw-rail-people'),
      railRoom:      root.querySelector('#sw-rail-room'),
      railLeave:     root.querySelector('#sw-rail-leave'),
      chatBadge:     root.querySelector('#sw-chat-badge'),
      pip:           root.querySelector('#sw-pip'),
      buf, toasts, burst, manual, peek,
    };
  }

  // ══════════════════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════════════════
  _bindEvents() {
    const { el } = this;

    el.launcher.addEventListener('click', () => this.openPanel());
    el.edgeHandle.addEventListener('click', () => this.closePanel());
    el.closeBtn.addEventListener('click',   () => this.closePanel());
    el.miniBtn.addEventListener('click',    () => this._toggleMini());

    // Mini rail
    el.railExpand.addEventListener('click',  () => this._exitMini());
    el.railChat.addEventListener('click',    () => { this._exitMini(); this._switchTab('chat'); });
    el.railPeople.addEventListener('click',  () => { this._exitMini(); this._switchTab('people'); });
    el.railRoom.addEventListener('click',    () => { this._exitMini(); this._switchTab('room'); });
    el.railLeave.addEventListener('click',   () => this._doLeave());

    // Draggable mini panel
    this._initDrag();

    // Tabs
    el.root.querySelectorAll('.sw-tab').forEach(t => {
      t.addEventListener('click', () => this._switchTab(t.dataset.tab));
    });

    // Join
    el.joinBtn.addEventListener('click',   () => this._doJoin());
    el.createBtn.addEventListener('click', () => {
      el.roomInput.value = Math.random().toString(36).substr(2, 6).toUpperCase();
      this._doJoin();
    });
    el.roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._doJoin(); });

    // Room
    el.copyBtn.addEventListener('click', () => this._copyId());
    el.syncNowBtn.addEventListener('click', () => {
      if (window.SyncOrchestrator) window.SyncOrchestrator.sendSyncNow();
      this._sysMsg('⚡ Synced everyone to your position');
    });
    el.claimBtn.addEventListener('click', () => {
      safeSendMsg({ type: 'to-server', data: { type: 'claim-host' } });
    });
    el.releaseBtn.addEventListener('click', () => {
      safeSendMsg({ type: 'to-server', data: { type: 'release-host' } });
    });
    el.leaveBtn.addEventListener('click', () => this._doLeave());

    // Share link
    el.shareBtn.addEventListener('click', () => this._toggleShareBlock());
    el.shareCopyBtn.addEventListener('click', () => this._copyShareLink());

    // Chat
    el.chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendChat(); }
    });
    el.chatInput.addEventListener('input', () => this._startTyping());
    el.sendBtn.addEventListener('click', () => this._sendChat());

    // Reactions
    el.root.querySelectorAll('.sw-react').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        if (window.SyncOrchestrator) window.SyncOrchestrator.sendReaction(emoji);
        this._burst(emoji, null);
      });
    });

    // Keyboard shortcut: Alt+W to toggle
    window.addEventListener('keydown', e => {
      if (e.altKey && e.key === 'w') {
        this.panelOpen ? this.closePanel() : this.openPanel();
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // DRAGGABLE MINI PANEL
  // ══════════════════════════════════════════════════════
  _initDrag() {
    const { dragHandle, panel } = this.el;
    if (!dragHandle) return;

    this._drag = { active: false, startX: 0, startY: 0, startTop: 0, startLeft: 0, docked: 'right' };

    const onMove = (clientX, clientY) => {
      if (!this._drag.active) return;
      const deltaX = clientX - this._drag.startX;
      const deltaY = clientY - this._drag.startY;
      
      let newLeft = this._drag.startLeft + deltaX;
      let newTop = this._drag.startTop + deltaY;
      
      const rect = panel.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
      newLeft = Math.max(0, Math.min(newLeft, maxX));
      newTop = Math.max(0, Math.min(newTop, maxY));
      
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
    };

    const startDrag = (x, y) => {
      if (!this.miniMode) return;
      const rect = panel.getBoundingClientRect();
      this._drag.active = true;
      this._drag.startX = x;
      this._drag.startY = y;
      this._drag.startTop = rect.top;
      this._drag.startLeft = rect.left;
      
      panel.classList.add('dragging');
      panel.classList.remove('docked-left', 'docked-right');
      
      // Detach from right to float freely
      panel.style.right = 'auto';
      panel.style.left = rect.left + 'px';
    };

    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    });

    dragHandle.addEventListener('touchstart', (e) => {
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    document.addEventListener('touchmove', (e) => {
      if (this._drag.active) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    const stopDrag = () => {
      if (!this._drag.active) return;
      this._drag.active = false;
      panel.classList.remove('dragging');
      
      const rect = panel.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const screenMid = window.innerWidth / 2;
      
      if (centerX < screenMid) {
        panel.style.right = 'auto';
        panel.style.left = '0px';
        panel.classList.add('docked-left');
        this._drag.docked = 'left';
      } else {
        panel.style.left = 'auto';
        panel.style.right = '0px';
        panel.classList.add('docked-right');
        this._drag.docked = 'right';
      }
    };
    
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
  }

  // ══════════════════════════════════════════════════════
  // PANEL OPEN/CLOSE
  // ══════════════════════════════════════════════════════
  openPanel() {
    this.panelOpen = true;
    this.miniMode  = false;
    this.el.root.classList.add('open');
    this.el.root.classList.remove('mini');
    this.el.launcher.classList.add('hidden');
    this.el.chatBadge.classList.remove('show');
    this._updateToastPos(true);
  }

  closePanel() {
    this.panelOpen = false;
    this.miniMode  = false;
    this.el.root.classList.remove('open', 'mini');
    this.el.launcher.classList.remove('hidden');
    this._updateToastPos(false);
  }

  _toggleMini() {
    if (this.miniMode) this._exitMini(); else this._enterMini();
  }

  _enterMini() {
    this.miniMode = true;
    this.el.root.classList.add('mini');
    this.el.root.classList.add('open');
    this.el.launcher.classList.add('hidden');
    
    this.el.panel.style.top = '40%';
    this.el.panel.style.bottom = 'auto';
    this.el.panel.style.left = 'auto';
    this.el.panel.style.right = '0px';
    this.el.panel.classList.remove('docked-left', 'dragging');
    this.el.panel.classList.add('docked-right');
    this._drag.docked = 'right';
  }

  _exitMini() {
    this.miniMode = false;
    this.el.root.classList.remove('mini');
    this.el.root.classList.add('open');
    this.el.panel.style.top = '';
    this.el.panel.style.bottom = '';
    this.el.panel.style.left = '';
    this.el.panel.style.right = '';
    this.el.panel.classList.remove('docked-left', 'docked-right', 'dragging');
  }

  _updateToastPos(open) {
    this.el.toasts.classList.toggle('panel-closed', !open);
  }

  // ══════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════
  setConnected(connected) {
    this.state.connected = connected;
    this._renderConn();
    if (!connected && this.state.roomId) this._sysMsg('⚡ Connection lost — reconnecting…');
  }

  setBuffering(on) { this.el.buf.classList.toggle('show', on); }

  showManualSyncPrompt() {
    this.el.manual.classList.add('show');
    setTimeout(() => this.el.manual.classList.remove('show'), 5000);
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
      case 'sync-now':     this._onSyncNow(data);     break;
      case 'error':        this._sysMsg(`⚠ ${data.message}`); break;
    }
  }

  // ══════════════════════════════════════════════════════
  // SERVER HANDLERS
  // ══════════════════════════════════════════════════════
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
    this._renderPeople();
    this._sysMsg(`${data.identity.name} joined`);
    this._toast(data.identity, `${data.identity.name} joined the room`);
  }

  _onUserLeft(data) {
    this.state.participants = this.state.participants.filter(p => p.id !== data.userId);
    if (data.identity?.name) {
      clearTimeout(this.activeTypers.get(data.identity.name));
      this.activeTypers.delete(data.identity.name);
      this._renderTyping();
    }
    this._renderPeople();
    if (data.identity) this._sysMsg(`${data.identity.name} left`);
  }

  _onHostChanged(data) {
    this.state.hostId = data.hostId;
    this.state.participants = this.state.participants.map(p => ({
      ...p, isHost: p.id === data.hostId,
    }));
    this._renderPeople();
    this._renderHostControls();

    if (data.hostId === this.state.myId) {
      this._toast(null, '👑 You are now the Host');
    } else if (data.identity) {
      this._toast({ color: '#e8b84b', initial: '👑' }, `${data.identity.name} is now Host`);
    } else {
      this._sysMsg('Host released — anyone can claim');
    }
  }

  _onChatMsg(data) {
    this._onTypingStop(data);
    this._appendMsg(data.identity, data.message, false);
    if (!this.panelOpen || (this.panelOpen && this.activeTab !== 'chat')) {
      this.el.chatBadge.classList.add('show');
    }
    if (this.miniMode) this._peekMsg(`${data.identity.name}: ${data.message}`);
  }

  _onVideoSync(data) {
    if (!data.identity) return;
    const verbs = { play: '▶ played', pause: '⏸ paused', seek: '⏩ seeked' };
    const verb = verbs[data.event];
    if (verb) {
      this._sysMsg(`${data.identity.name} ${verb}`);
      this.state.playing = data.event === 'play' || (data.event !== 'pause' && this.state.playing);
      this._updatePlayState();
    }
  }

  _onTypingStart(data) {
    const name = data.identity?.name; if (!name) return;
    clearTimeout(this.activeTypers.get(name));
    this.activeTypers.set(name, setTimeout(() => { this.activeTypers.delete(name); this._renderTyping(); }, 4000));
    this._renderTyping();
  }

  _onTypingStop(data) {
    const name = data.identity?.name; if (!name) return;
    clearTimeout(this.activeTypers.get(name));
    this.activeTypers.delete(name);
    this._renderTyping();
  }

  _onReaction(data) {
    this._burst(data.emoji, data.identity);
    this._toast(data.identity, `${data.identity.name} reacted ${data.emoji}`);
  }

  _onSyncNow(data) {
    this._sysMsg(`⚡ ${data.identity?.name ?? 'Host'} synced everyone`);
  }

  // ══════════════════════════════════════════════════════
  // SHARE LINK
  // ══════════════════════════════════════════════════════
  _buildShareLink() {
    const room = this.state.roomId;
    if (!room) return '';
    const currentUrl = window.location.href.split('?')[0];
    return `${currentUrl}?sw_room=${encodeURIComponent(room)}`;
  }

  _toggleShareBlock() {
    const isVisible = this.el.shareBlock.classList.contains('visible');
    if (isVisible) {
      this.el.shareBlock.classList.remove('visible');
      this.el.shareBtn.textContent = '🔗 Get Invite Link';
    } else {
      const link = this._buildShareLink();
      this.el.shareUrl.textContent = link;
      this.el.shareBlock.classList.add('visible');
      this.el.shareBtn.textContent = '🔗 Hide Invite Link';
    }
  }

  _copyShareLink() {
    const link = this._buildShareLink();
    navigator.clipboard.writeText(link).then(() => {
      this.el.shareCopyBtn.textContent = 'Copied!';
      setTimeout(() => { this.el.shareCopyBtn.textContent = 'Copy'; }, 2200);
      this._toast(null, '🔗 Invite link copied to clipboard!');
    });
  }

  // ══════════════════════════════════════════════════════
  // EMOJI BURST
  // ══════════════════════════════════════════════════════
  _burst(emoji, identity) {
    const count = 5 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'sw-emoji-burst';
      el.textContent = emoji;
      const x   = 20 + Math.random() * 60;
      const ty  = -(60 + Math.random() * 100);
      const tx  = (Math.random() - 0.5) * 90;
      const dur = 1100 + Math.random() * 600;
      const delay = Math.random() * 250;
      const size  = 20 + Math.random() * 16;
      el.style.cssText = `left:${x}%;bottom:18%;font-size:${size}px;animation-delay:${delay}ms;--dur:${dur}ms;--tx:${tx}px;--ty:${ty}px;`;
      this.el.burst.appendChild(el);
      setTimeout(() => el.remove(), delay + dur + 100);
    }
  }

  // ══════════════════════════════════════════════════════
  // DRIFT METER
  // ══════════════════════════════════════════════════════
  updateDrift(deltaS) {
    const abs = Math.abs(deltaS);
    const pct = Math.min(abs / 5, 1);
    this.el.driftFill.style.width = `${pct * 100}%`;
    const [color, val] = abs < 0.5 ? ['var(--green)', '✓'] :
                         abs < 2   ? ['var(--amber)', `${abs.toFixed(1)}s`] :
                                     ['var(--red)',   `${abs.toFixed(1)}s`];
    this.el.driftFill.style.background = color;
    this.el.driftVal.style.color = color;
    this.el.driftVal.textContent = val;
  }

  // ══════════════════════════════════════════════════════
  // LIVE TIME DISPLAY
  // ══════════════════════════════════════════════════════
  _startTimeUpdater() {
    clearInterval(this._timeInterval);
    this._timeInterval = setInterval(() => {
      if (!this.state.roomId || !window.SyncOrchestrator) return;
      const t   = window.SyncOrchestrator.getCurrentTime?.() ?? 0;
      const m   = Math.floor(t / 60);
      const s   = Math.floor(t % 60).toString().padStart(2, '0');
      const hr  = m >= 60 ? `${Math.floor(m/60)}:${(m%60).toString().padStart(2,'0')}:` : '';
      const min = (m % 60).toString().padStart(2, '0');
      this.el.timeDisplay.textContent = `${hr}${min}:${s}`;
      const paused = window.SyncOrchestrator.isPaused?.() ?? true;
      this.state.playing = !paused;
      this._updatePlayState();
    }, 500);
  }

  _updatePlayState() {
    const { playing } = this.state;
    this.el.playState.textContent = playing ? 'Playing' : 'Paused';
    this.el.playState.className = `sw-play-state ${playing ? 'playing' : 'paused'}`;
  }

  // ══════════════════════════════════════════════════════
  // ROOM ACTIONS
  // ══════════════════════════════════════════════════════
  _doJoin() {
    const roomId = this.el.roomInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    if (!roomId) { this.el.roomInput.focus(); return; }
    this.state.roomId = roomId;
    this._switchToRoom();
    if (window.SyncOrchestrator) window.SyncOrchestrator.setRoom(roomId);
    if (window.SyncOrchestrator?.isDRM?.()) {
      this.el.drm.textContent = '⚠️ DRM content detected — manual sync mode. Coordinate play/pause with your group.';
      this.el.drm.style.display = 'block';
    }
  }

  _doLeave() {
    this.state.roomId       = null;
    this.state.hostId       = null;
    this.state.participants = [];
    this.el.messages.innerHTML = '';
    this.activeTypers.clear();
    this._renderTyping();
    this.el.drift.classList.remove('visible');
    this.el.drm.style.display = 'none';
    this.el.shareBlock.classList.remove('visible');
    this.el.shareBtn.textContent = '🔗 Get Invite Link';
    this._switchToJoin();
    if (window.SyncOrchestrator) window.SyncOrchestrator.setRoom(null);
  }

  _sendChat() {
    const msg = this.el.chatInput.value.trim();
    if (!msg) return;
    const me = this.state.participants.find(p => p.id === this.state.myId);
    const identity = me?.identity ?? { name: 'You', color: '#4f6ef7', initial: 'Y' };
    this._appendMsg(identity, msg, true);
    safeSendMsg({ type: 'to-server', data: { type: 'chat-message', message: msg } });
    this.el.chatInput.value = '';
    this._stopTyping();
  }

  _copyId() {
    navigator.clipboard.writeText(this.state.roomId ?? '').then(() => {
      this.el.copyBtn.textContent = 'Copied!';
      setTimeout(() => { this.el.copyBtn.textContent = 'Copy'; }, 2000);
    });
  }

  // ══════════════════════════════════════════════════════
  // TYPING
  // ══════════════════════════════════════════════════════
  _startTyping() {
    if (!this.typingTimeout) {
      safeSendMsg({ type: 'to-server', data: { type: 'typing-start' } });
    }
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this._stopTyping(), 2500);
  }

  _stopTyping() {
    clearTimeout(this.typingTimeout);
    this.typingTimeout = null;
    safeSendMsg({ type: 'to-server', data: { type: 'typing-stop' } });
  }

  _renderTyping() {
    const names = Array.from(this.activeTypers.keys());
    if (!names.length) { this.el.typing.textContent = ''; return; }
    const str  = names.slice(0, 2).join(', ');
    const more = names.length > 2 ? ' +more' : '';
    this.el.typing.textContent = `${str}${more} ${names.length > 1 ? 'are' : 'is'} typing…`;
  }

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  _renderAll() {
    this._renderConn();
    if (this.state.roomId) { this._switchToRoom(); } else { this._switchToJoin(); }
    this._renderPeople();
    this._renderHostControls();
  }

  _renderConn() {
    const on = this.state.connected;
    this.el.dot.classList.toggle('on', on);
    this.el.connText.textContent = on ? 'Connected' : 'Offline';
    this.el.pip.classList.toggle('on', on);
  }

  _switchToJoin() {
    this.state.view = 'join';
    this.el.tabs.classList.remove('visible');
    this._showPane('join');
    this.el.hostBadge.style.display = 'none';
    this.el.videoBlock.style.display = 'none';
  }

  _switchToRoom() {
    this.state.view = 'room';
    this.el.tabs.classList.add('visible');
    this.el.roomVal.textContent = (this.state.roomId ?? '').toUpperCase();
    this.el.videoBlock.style.display = 'block';
    // Update share URL if visible
    if (this.el.shareBlock.classList.contains('visible')) {
      this.el.shareUrl.textContent = this._buildShareLink();
    }
    this._switchTab(this.activeTab);
  }

  _showPane(id) {
    ['join','chat','people','room'].forEach(p => {
      const key = `pane${p.charAt(0).toUpperCase()+p.slice(1)}`;
      if (this.el[key]) this.el[key].classList.remove('active');
    });
    const key = `pane${id.charAt(0).toUpperCase()+id.slice(1)}`;
    if (this.el[key]) this.el[key].classList.add('active');
  }

  _switchTab(tab) {
    if (this.state.view !== 'room') return;
    this.activeTab = tab;
    if (tab === 'chat') this.el.chatBadge.classList.remove('show');
    this.el.root.querySelectorAll('.sw-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    this._showPane(tab);
  }

  _renderPeople() {
    this.el.people.innerHTML = '';
    for (const p of this.state.participants) {
      const isMe   = p.id === this.state.myId;
      const isHost = p.id === this.state.hostId;
      const div = document.createElement('div');
      div.className = 'sw-person';
      div.innerHTML = `
        <div class="sw-person-av" style="background:${p.identity.color}18;border:1.5px solid ${p.identity.color}35;color:${p.identity.color}">
          ${p.identity.initial}
        </div>
        <div class="sw-person-info">
          <div class="sw-person-name" style="color:${p.identity.color}">
            ${this._esc(p.identity.name)}
            ${isMe ? '<span class="sw-you-tag">you</span>' : ''}
          </div>
          <div class="sw-person-role">${isHost ? '👑 Host' : '· Viewer'}</div>
        </div>
      `;
      this.el.people.appendChild(div);
    }
  }

  _renderHostControls() {
    const isHost = this.state.hostId === this.state.myId;
    const noHost = !this.state.hostId;
    this.el.hostBadge.style.display  = isHost ? 'inline-block' : 'none';
    this.el.syncNowBtn.style.display  = isHost ? 'block'        : 'none';
    this.el.claimBtn.style.display    = (!isHost && noHost) ? 'block' : 'none';
    this.el.releaseBtn.style.display  = isHost ? 'block' : 'none';
    const showDrift = !!this.state.roomId && !!this.state.hostId && !isHost;
    this.el.drift.classList.toggle('visible', showDrift);
  }

  // ══════════════════════════════════════════════════════
  // MESSAGES
  // ══════════════════════════════════════════════════════
  _appendMsg(identity, text, isOwn) {
    const div = document.createElement('div');
    div.className = `sw-msg${isOwn ? ' own' : ''}`;
    div.innerHTML = `
      <div class="sw-avatar" style="background:${identity.color}18;border:1.5px solid ${identity.color}35;color:${identity.color}">${identity.initial}</div>
      <div class="sw-msg-body">
        <div class="sw-msg-name" style="color:${identity.color}">${this._esc(identity.name)}</div>
        <div class="sw-bubble">${this._esc(text)}</div>
      </div>
    `;
    this.el.messages.appendChild(div);
    this.el.messages.scrollTop = this.el.messages.scrollHeight;
  }

  _sysMsg(text) {
    const div = document.createElement('div');
    div.className = 'sw-sys-msg';
    div.textContent = text;
    this.el.messages.appendChild(div);
    this.el.messages.scrollTop = this.el.messages.scrollHeight;
  }

  // ══════════════════════════════════════════════════════
  // TOASTS
  // ══════════════════════════════════════════════════════
  _toast(identity, text) {
    const div = document.createElement('div');
    div.className = 'sw-toast';
    if (identity) {
      div.innerHTML = `<div class="sw-toast-av" style="background:${identity.color}28;color:${identity.color}">${identity.initial}</div>${this._esc(text)}`;
    } else {
      div.textContent = text;
    }
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), 4500);
  }

  // ══════════════════════════════════════════════════════
  // PEEK STRIP (mini mode)
  // ══════════════════════════════════════════════════════
  _peekMsg(text) {
    const div = document.createElement('div');
    div.className = 'sw-peek-msg';
    div.textContent = text.slice(0, 34) + (text.length > 34 ? '…' : '');
    this.el.peek.appendChild(div);
    this.el.peek.classList.add('show');
    this.peekMsgs.push(div);
    if (this.peekMsgs.length > 3) this.peekMsgs.shift().remove();
    clearTimeout(this._peekTimeout);
    this._peekTimeout = setTimeout(() => { this.el.peek.classList.remove('show'); }, 3500);
  }

  // ══════════════════════════════════════════════════════
  // UTILS
  // ══════════════════════════════════════════════════════
  _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  _syncStatus() {
    safeSendMsg({ type: 'get-status' }, (res) => {
      try {
        if (chrome.runtime.lastError) return;
        if (res?.connected) this.state.connected = true;
        if (res?.room)      this.state.roomId    = res.room;
        if (res?.myId)      this.state.myId      = res.myId;
        this._renderAll();
      } catch(e) {}
    });
  }
}

window.SyncUI = new SyncWatchUI();