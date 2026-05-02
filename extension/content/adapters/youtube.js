class YouTubeAdapter extends window.BaseAdapter {
  findVideo() {
    this.video = document.querySelector('.html5-main-video') ?? null;
  }

  init(callbacks) {
    super.init(callbacks);
    this._setupYTNavigation();
  }

  _setupYTNavigation() {
    // YouTube fires this custom event on SPA navigation
    const handler = () => {
      // Short delay so YT has time to swap the video element
      setTimeout(() => {
        const prev = this.video;
        this.findVideo();
        if (this.video && this.video !== prev) {
          this.destroy();   // remove old listeners
          this._attachListeners();
        }
      }, 1500);
    };

    window.addEventListener('yt-navigate-finish', handler);
    window.addEventListener('yt-page-data-updated', handler);
  }
}

window.YouTubeAdapter = YouTubeAdapter;