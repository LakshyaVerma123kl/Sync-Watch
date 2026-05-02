class SyncWatchUI {
  constructor() {
    this.container = null;
    this.toastContainer = null;
    this.state = {
      connected: false,
      roomId: null,
      hostId: null,
      myId: null,
      identity: null,
      participants: []
    };
    
    this.typingTimeout = null;
    this.activeTypers = new Set();
    
    this.init();
  }

  init() {
    if (document.getElementById('syncwatch-overlay')) return;

    this.container = document.createElement('div');
    this.container.id = 'syncwatch-overlay';
    this.container.classList.add('minimized'); // Start hidden
    
    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'sw-toast-container';
    
    this.openBtn = document.createElement('div');
    this.openBtn.id = 'sw-open-btn';
    this.openBtn.className = 'sw-video-overlay-btn';
    this.openBtn.innerHTML = '<span class="icon">🍿</span> SyncWatch';
    
    this.render();
    document.body.appendChild(this.container);
    document.body.appendChild(this.toastContainer);
    document.body.appendChild(this.openBtn);
    
    this.attachEvents();
    this.checkStatus();
  }

  render() {
    this.container.innerHTML = `
      <div class="sw-toggle-btn" id="sw-toggle">▶</div>
      <div class="syncwatch-header">
        <div class="syncwatch-title-row">
          <h3 class="syncwatch-title">
            <div class="syncwatch-status-dot" id="sw-status"></div>
            SyncWatch <span class="host-badge" id="sw-host-badge">HOST</span>
          </h3>
        </div>
      </div>
      
      <div class="sw-tabs" id="sw-tabs" style="display: none;">
        <div class="sw-tab active" data-tab="chat">Chat</div>
        <div class="sw-tab" data-tab="participants">Participants</div>
      </div>

      <div class="syncwatch-content" id="sw-join-view">
        <div class="syncwatch-input-group">
          <label>Room ID</label>
          <input type="text" id="sw-room-input" class="syncwatch-input" placeholder="e.g. x8k9m" />
        </div>
        <button class="syncwatch-btn" id="sw-join-btn">Join Room</button>
        <button class="syncwatch-btn secondary" id="sw-create-btn">Create New Room</button>
      </div>

      <div class="sw-tab-content active" id="tab-chat" style="display: none;">
        <div class="syncwatch-content" style="padding-bottom: 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <div class="syncwatch-input-group" style="margin-bottom: 10px;">
            <label>Current Room</label>
            <input type="text" id="sw-room-display" class="syncwatch-input" readonly />
          </div>
          <button class="syncwatch-btn secondary" id="sw-claim-host-btn" style="display: none;">Claim Host</button>
          <button class="syncwatch-btn warning" id="sw-leave-btn">Leave Room</button>
        </div>
        <div class="syncwatch-chat-messages" id="sw-chat-messages"></div>
        <div class="sw-typing-indicator" id="sw-typing-indicator"></div>
        <div class="syncwatch-chat-input-area">
          <input type="text" id="sw-chat-input" class="syncwatch-chat-input" placeholder="Type a message..." />
        </div>
      </div>

      <div class="sw-tab-content" id="tab-participants">
        <div class="sw-participants-list" id="sw-participants-list"></div>
      </div>
    `;

    this.cacheDOM();
  }

  cacheDOM() {
    this.statusDot = this.container.querySelector('#sw-status');
    this.joinView = this.container.querySelector('#sw-join-view');
    this.chatTabContent = this.container.querySelector('#tab-chat');
    this.participantsTabContent = this.container.querySelector('#tab-participants');
    this.tabsContainer = this.container.querySelector('#sw-tabs');
    
    this.roomInput = this.container.querySelector('#sw-room-input');
    this.roomDisplay = this.container.querySelector('#sw-room-display');
    this.chatMessages = this.container.querySelector('#sw-chat-messages');
    this.chatInput = this.container.querySelector('#sw-chat-input');
    this.hostBadge = this.container.querySelector('#sw-host-badge');
    this.claimHostBtn = this.container.querySelector('#sw-claim-host-btn');
    this.typingIndicator = this.container.querySelector('#sw-typing-indicator');
    this.participantsList = this.container.querySelector('#sw-participants-list');
  }

  attachEvents() {
    this.openBtn.addEventListener('click', () => {
      this.container.classList.remove('minimized');
      this.openBtn.style.display = 'none';
      const btn = this.container.querySelector('#sw-toggle');
      if (btn) btn.textContent = '▶';
    });

    this.container.querySelector('#sw-toggle').addEventListener('click', () => {
      this.container.classList.add('minimized');
      this.openBtn.style.display = 'flex';
      const btn = this.container.querySelector('#sw-toggle');
      if (btn) btn.textContent = '◀';
    });

    // Tabs logic
    this.container.querySelectorAll('.sw-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.container.querySelectorAll('.sw-tab').forEach(t => t.classList.remove('active'));
        this.container.querySelectorAll('.sw-tab-content').forEach(c => c.classList.remove('active'));
        
        e.target.classList.add('active');
        this.container.querySelector(`#tab-${e.target.dataset.tab}`).classList.add('active');
      });
    });

    this.container.querySelector('#sw-join-btn').addEventListener('click', () => {
      const roomId = this.roomInput.value.trim();
      if (roomId) this.joinRoom(roomId);
    });

    this.container.querySelector('#sw-create-btn').addEventListener('click', () => {
      const roomId = Math.random().toString(36).substr(2, 6);
      this.joinRoom(roomId);
    });

    this.container.querySelector('#sw-leave-btn').addEventListener('click', () => this.leaveRoom());

    this.claimHostBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'claim-host' } });
    });

    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const msg = this.chatInput.value.trim();
        if (msg) {
          this.sendMessage(msg);
          this.chatInput.value = '';
          this.handleTypingStop();
        }
      }
    });

    this.chatInput.addEventListener('input', () => this.handleTypingStart());

    this.roomDisplay.addEventListener('click', () => {
      this.roomDisplay.select();
      navigator.clipboard.writeText(this.roomDisplay.value);
      this.showToast('Room ID copied to clipboard!', '#5E6AD2', '📋');
    });
  }

  handleTypingStart() {
    if (!this.typingTimeout) {
      chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'typing-start' } });
    }
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.handleTypingStop(), 2000);
  }

  handleTypingStop() {
    clearTimeout(this.typingTimeout);
    this.typingTimeout = null;
    chrome.runtime.sendMessage({ type: 'to-server', data: { type: 'typing-stop' } });
  }

  updateView() {
    this.statusDot.classList.toggle('connected', this.state.connected);

    if (this.state.roomId) {
      this.joinView.style.display = 'none';
      this.tabsContainer.style.display = 'flex';
      this.chatTabContent.style.display = this.container.querySelector('[data-tab="chat"]').classList.contains('active') ? 'flex' : 'none';
      
      this.roomDisplay.value = this.state.roomId;
      
      if (this.state.hostId) {
        this.claimHostBtn.style.display = 'none';
        if (this.state.hostId === this.state.myId) {
          this.hostBadge.style.display = 'inline-block';
        } else {
          this.hostBadge.style.display = 'none';
        }
      } else {
        this.claimHostBtn.style.display = 'block';
        this.hostBadge.style.display = 'none';
      }

      this.renderParticipants();
    } else {
      this.joinView.style.display = 'block';
      this.tabsContainer.style.display = 'none';
      this.chatTabContent.style.display = 'none';
      this.participantsTabContent.style.display = 'none';
      this.chatMessages.innerHTML = '';
      this.hostBadge.style.display = 'none';
    }
  }

  renderParticipants() {
    this.participantsList.innerHTML = '';
    for (const p of this.state.participants) {
      const isMe = p.id === this.state.myId;
      const isHost = p.id === this.state.hostId;
      
      const el = document.createElement('div');
      el.className = 'sw-participant';
      el.innerHTML = `
        <div class="sw-avatar" style="background: ${p.identity.color}">${p.identity.initial}</div>
        <div class="sw-participant-info">
          <div class="sw-participant-name" style="color: ${p.identity.color}">
            ${p.identity.name} ${isMe ? '(You)' : ''}
          </div>
          <div class="sw-participant-role">${isHost ? 'Host' : 'Viewer'}</div>
        </div>
      `;
      this.participantsList.appendChild(el);
    }
  }

  joinRoom(roomId) {
    this.state.roomId = roomId;
    this.updateView();
    if (window.SyncOrchestrator) window.SyncOrchestrator.setRoom(roomId);
  }

  leaveRoom() {
    this.state.roomId = null;
    this.state.hostId = null;
    this.state.participants = [];
    this.updateView();
    if (window.SyncOrchestrator) window.SyncOrchestrator.setRoom(null);
  }

  sendMessage(message) {
    const myIdentity = this.state.participants.find(p => p.id === this.state.myId)?.identity || { name: 'You', color: '#5E6AD2', initial: 'Y' };
    this.appendMessage(myIdentity, message, true);
    chrome.runtime.sendMessage({
      type: 'to-server',
      data: { type: 'chat-message', message }
    });
  }

  appendMessage(identity, text, isOwn = false) {
    const el = document.createElement('div');
    el.className = 'sw-message';
    if (isOwn) el.classList.add('own-message');
    
    el.innerHTML = `
      <div class="sw-message-header">
        ${!isOwn ? `<div class="sw-msg-avatar" style="background: ${identity.color}">${identity.initial}</div>` : ''}
        <span class="sender" style="color: ${isOwn ? '#fff' : identity.color}">${identity.name}</span>
      </div>
      ${text}
    `;
    
    this.chatMessages.appendChild(el);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  showToast(message, color, initial) {
    const el = document.createElement('div');
    el.className = 'sw-toast';
    el.innerHTML = `<div class="sw-avatar" style="background: ${color}; width: 28px; height: 28px; font-size: 14px;">${initial}</div> ${message}`;
    this.toastContainer.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4000);
  }

  updateTypingIndicator() {
    if (this.activeTypers.size === 0) {
      this.typingIndicator.textContent = '';
    } else {
      const names = Array.from(this.activeTypers).slice(0, 2).join(', ');
      const suffix = this.activeTypers.size > 2 ? ' and others' : '';
      const verb = this.activeTypers.size > 1 ? 'are' : 'is';
      this.typingIndicator.textContent = `${names}${suffix} ${verb} typing...`;
    }
  }

  handleServerMessage(data) {
    if (data.type === 'sync-state') {
      this.state.connected = true;
      this.state.hostId = data.hostId;
      this.state.myId = data.yourId;
      this.state.participants = data.participants || [];
      this.updateView();
    }
    
    if (data.type === 'user-joined') {
      this.state.participants.push({ id: data.userId, identity: data.identity, isHost: false });
      this.showToast(`${data.identity.name} joined the room`, data.identity.color, data.identity.initial);
      this.updateView();
    }
    
    if (data.type === 'user-left') {
      this.state.participants = this.state.participants.filter(p => p.id !== data.userId);
      if (data.identity) {
        this.showToast(`${data.identity.name} left the room`, data.identity.color, data.identity.initial);
      }
      this.activeTypers.delete(data.identity?.name);
      this.updateTypingIndicator();
      this.updateView();
    }
    
    if (data.type === 'host-changed') {
      this.state.hostId = data.hostId;
      if (data.hostId === this.state.myId) {
        this.showToast('You are now the Host', '#FFD60A', '👑');
      } else if (data.identity) {
        this.showToast(`${data.identity.name} is now the Host`, '#FFD60A', '👑');
      }
      this.updateView();
    }
    
    if (data.type === 'chat-message') {
      this.activeTypers.delete(data.identity.name);
      this.updateTypingIndicator();
      this.appendMessage(data.identity, data.message, false);
    }

    if (data.type === 'video-sync' && data.identity) {
      const action = data.event === 'play' ? 'played' : data.event === 'pause' ? 'paused' : 'seeked';
      this.showToast(`${data.identity.name} ${action} the video`, data.identity.color, '▶️');
    }

    if (data.type === 'typing-start') {
      this.activeTypers.add(data.identity.name);
      this.updateTypingIndicator();
    }

    if (data.type === 'typing-stop') {
      this.activeTypers.delete(data.identity.name);
      this.updateTypingIndicator();
    }
  }

  checkStatus() {
    chrome.runtime.sendMessage({ type: 'get-status' }, (response) => {
      if (response && response.connected) {
        this.state.connected = response.connected;
        this.state.roomId = response.room;
        this.state.myId = response.myId;
      }
    });
  }
}

window.SyncUI = new SyncWatchUI();