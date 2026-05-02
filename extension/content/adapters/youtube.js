class YouTubeAdapter extends window.BaseAdapter {
  findVideo() {
    this.video = document.querySelector('.html5-main-video') ?? document.querySelector('video') ?? null;
  }

  init(callbacks) {
    super.init(callbacks);
    this._setupYTNavigation();
  }

  _setupYTNavigation() {
    const handler = () => {
      setTimeout(() => {
        const prev = this.video;
        this.findVideo();
        if (this.video && this.video !== prev) {
          this.destroy();
          this._attachListeners();
        }
      }, 1500);
    };
    window.addEventListener('yt-navigate-finish', handler);
    window.addEventListener('yt-page-data-updated', handler);
  }
}
window.YouTubeAdapter = YouTubeAdapter;