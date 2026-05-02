class BaseAdapter {
  constructor() {
    this.video = null;
    this.callbacks = {
      onPlay: () => {},
      onPause: () => {},
      onSeek: () => {},
      onWaiting: () => {},
      onPlaying: () => {}
    };
    this.isSyncing = false; 
    this.controlsLocked = false;
  }

  findVideo() {
    throw new Error('Not implemented');
  }

  init(callbacks) {
    this.callbacks = callbacks;
    this.findVideo();
    
    if (this.video) {
      this.attachListeners();
    } else {
      this.observeDOM();
    }
  }

  attachListeners() {
    if (!this.video) return;

    this.video.addEventListener('play', () => {
      if (!this.isSyncing && !this.controlsLocked) this.callbacks.onPlay(this.video.currentTime);
    });

    this.video.addEventListener('pause', () => {
      if (!this.isSyncing && !this.controlsLocked) this.callbacks.onPause(this.video.currentTime);
    });

    this.video.addEventListener('seeked', () => {
      if (!this.isSyncing && !this.controlsLocked) this.callbacks.onSeek(this.video.currentTime);
    });

    // Smart buffering sync
    this.video.addEventListener('waiting', () => {
      if (!this.isSyncing) this.callbacks.onWaiting(this.video.currentTime);
    });

    this.video.addEventListener('playing', () => {
      if (!this.isSyncing) this.callbacks.onPlaying(this.video.currentTime);
    });
  }

  observeDOM() {
    const observer = new MutationObserver(() => {
      if (!this.video) {
        this.findVideo();
        if (this.video) {
          this.attachListeners();
          observer.disconnect();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  play() {
    if (this.video && this.video.paused) {
      this.isSyncing = true;
      this.video.play().finally(() => {
        setTimeout(() => this.isSyncing = false, 100);
      });
    }
  }

  pause() {
    if (this.video && !this.video.paused) {
      this.isSyncing = true;
      this.video.pause();
      setTimeout(() => this.isSyncing = false, 100);
    }
  }

  seek(time) {
    if (this.video && Math.abs(this.video.currentTime - time) > 1) { 
      this.isSyncing = true;
      this.video.currentTime = time;
      setTimeout(() => this.isSyncing = false, 100);
    }
  }

  lockControls(locked) {
    this.controlsLocked = locked;
  }
}

window.BaseAdapter = BaseAdapter;
