/**
 * BaseAdapter — abstract class every site adapter extends.
 */
class BaseAdapter {
  constructor() {
    this.video          = null;
    this.callbacks      = {};
    this.isSyncing      = false;
    this.controlsLocked = false;
    this._syncTimer     = null;
    this._listeners     = [];
    this._driftInterval = null;
  }

  findVideo() { throw new Error('BaseAdapter.findVideo() not implemented'); }

  init(callbacks) {
    this.callbacks = callbacks;
    this.findVideo();
    if (this.video) {
      this._attachListeners();
    } else {
      this._observeDOM();
    }
  }

  play() {
    if (!this.video || !this.video.paused) return;
    this._withSync(() => this.video.play().catch(() => {}));
  }

  pause() {
    if (!this.video || this.video.paused) return;
    this._withSync(() => this.video.pause());
  }

  seek(time) {
    if (!this.video) return;
    if (Math.abs(this.video.currentTime - time) < 0.5) return;
    this._withSync(() => { this.video.currentTime = time; });
  }

  getCurrentTime() { return this.video?.currentTime ?? 0; }
  isPaused()       { return this.video?.paused       ?? true; }
  getDuration()    { return this.video?.duration     ?? 0; }

  lockControls(locked) { this.controlsLocked = locked; }

  destroy() {
    for (const [el, evt, fn] of this._listeners) el.removeEventListener(evt, fn);
    this._listeners = [];
    if (this._driftInterval) clearInterval(this._driftInterval);
  }

  _on(el, event, fn) {
    el.addEventListener(event, fn);
    this._listeners.push([el, event, fn]);
  }

  _withSync(fn) {
    this.isSyncing = true;
    fn();
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => { this.isSyncing = false; }, 300);
  }

  _attachListeners() {
    if (!this.video) return;
    const v = this.video;

    this._on(v, 'play',    () => { if (!this.isSyncing && !this.controlsLocked) this.callbacks.onPlay?.(v.currentTime); });
    this._on(v, 'pause',   () => { if (!this.isSyncing && !this.controlsLocked) this.callbacks.onPause?.(v.currentTime); });
    this._on(v, 'seeked',  () => { if (!this.isSyncing && !this.controlsLocked) this.callbacks.onSeek?.(v.currentTime); });
    this._on(v, 'waiting', () => { if (!this.isSyncing) this.callbacks.onWaiting?.(v.currentTime); });
    this._on(v, 'playing', () => { if (!this.isSyncing) this.callbacks.onPlaying?.(v.currentTime); });

    this._driftInterval = setInterval(() => {
      if (this.video && !this.video.paused && !this.isSyncing) {
        this.callbacks.onDrift?.(v.currentTime);
      }
    }, 5000);
  }

  _observeDOM() {
    const obs = new MutationObserver(() => {
      this.findVideo();
      if (this.video) {
        this._attachListeners();
        obs.disconnect();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 60000);
  }
}

window.BaseAdapter = BaseAdapter;