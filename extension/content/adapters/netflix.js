/**
 * NetflixAdapter — DRM content cannot be controlled, but we can show
 * timestamp prompts so users manually stay in sync.
 */
class NetflixAdapter extends window.BaseAdapter {
  get isDRM() { return true; }

  findVideo() {
    // Netflix uses an HTML5 video element but JS control is blocked by DRM
    this.video = document.querySelector('video') ?? null;
  }

  play()  { /* DRM — show manual prompt */ this.callbacks.onManualAction?.('play');  }
  pause() { /* DRM — show manual prompt */ this.callbacks.onManualAction?.('pause'); }
  seek(t) { /* DRM — show manual prompt */ this.callbacks.onManualAction?.('seek', t); }
}

window.NetflixAdapter = NetflixAdapter;