class NetflixAdapter extends window.BaseAdapter {
  get isDRM() { return true; }
  findVideo() { this.video = document.querySelector('video') ?? null; }
  play()  { this.callbacks.onManualAction?.('play');  }
  pause() { this.callbacks.onManualAction?.('pause'); }
  seek(t) { this.callbacks.onManualAction?.('seek', t); }
}
window.NetflixAdapter = NetflixAdapter;