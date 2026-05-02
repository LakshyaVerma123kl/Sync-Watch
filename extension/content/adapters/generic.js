class GenericAdapter extends window.BaseAdapter {
  findVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return;

    // Prefer visible, non-tiny videos; fall back to largest by area
    const scored = videos.map(v => {
      const r     = v.getBoundingClientRect();
      const area  = r.width * r.height;
      const vis   = r.width > 100 && r.height > 100;
      return { v, score: vis ? area + 1e9 : area };
    });

    scored.sort((a, b) => b.score - a.score);
    this.video = scored[0]?.v ?? null;
  }
}

window.GenericAdapter = GenericAdapter;