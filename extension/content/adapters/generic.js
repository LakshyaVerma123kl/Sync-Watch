class GenericAdapter extends window.BaseAdapter {
  findVideo() {
    // Try to find the largest video element on the page
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length > 0) {
      // Pick the video that is actually visible and likely the main content
      this.video = videos.sort((a, b) => {
        return (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight);
      })[0];
    }
  }
}

window.GenericAdapter = GenericAdapter;
