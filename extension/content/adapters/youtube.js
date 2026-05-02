class YouTubeAdapter extends window.BaseAdapter {
  findVideo() {
    this.video = document.querySelector('.html5-main-video');
  }

  // Override observeDOM because YouTube is an SPA and the video element might change entirely on navigation
  observeDOM() {
    super.observeDOM();
    
    // YouTube specific event for navigation
    window.addEventListener('yt-navigate-finish', () => {
      this.findVideo();
      this.attachListeners();
    });
  }
}

window.YouTubeAdapter = YouTubeAdapter;
