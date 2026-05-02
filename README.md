# 🎬 SyncWatch v3.1

> Watch any video in perfect sync with friends — anywhere on the web.

Real-time play/pause/seek synchronization via WebSockets, a premium Obsidian Cinema UI, host lock system, live chat with typing indicators, smart drift correction, and draggable mini mode.

---

## ✨ What's new in v3.1

| Area           | Improvement                                                                     |
| -------------- | ------------------------------------------------------------------------------- |
| **UI/UX**      | Obsidian Cinema UI with Outfit & DM Mono fonts; draggable mini/collapsed mode   |
| **Features**   | 1-click share invite links; interactive emoji bursts; real-time server health   |
| **Resilience** | Complete `chrome.runtime` try/catch safety for extension context invalidation   |
| **Sync**       | Elapsed-time correction when joining mid-play; periodic drift check every 5 s   |
| **Server**     | `release-host` command; `/room/:id/info` REST endpoint; input sanitisation      |
| **Background** | Exponential reconnect backoff; session state survives service worker restarts   |
| **Adapters**   | Netflix/Prime/Disney stub (DRM manual-sync mode); YouTube SPA navigation fix    |
| **Build**      | Validates `wss://` URL; checks archiver dependency before starting              |

---

## 🚀 Deploy the backend (free, 1-click)

1. Push this folder to a new GitHub repository.
2. Click **Deploy to Render**:

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

3. Copy the live `wss://` URL from the Render dashboard.

---

## 📦 Build the Chrome extension

```bash
npm install           # install archiver (root package)
node build.js wss://YOUR_RENDER_URL.onrender.com
```

This produces `syncwatch-release.zip`.

---

## 🌐 Publish to Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. **Add new item** → drag `syncwatch-release.zip`.
3. Fill in the listing and submit.

---

## 🛠 Local development

```bash
# Terminal 1 — backend
cd backend && npm install && npm run dev

# Terminal 2 — test page (optional)
npx serve . -p 8080
# Open http://localhost:8080/test-harness/index.html
```

Load the `extension/` folder unpacked in `chrome://extensions` with **Developer mode** on.

---

## 🏗 Architecture

```
syncwatch/
├── backend/
│   └── server.js          WebSocket + Express server
├── extension/
│   ├── manifest.json      MV3 manifest
│   ├── background/
│   │   └── background.js  Service worker — single WS connection, message routing
│   ├── content/
│   │   ├── adapters/
│   │   │   ├── base.js    Abstract adapter (sync guards, drift timer, DOM observer)
│   │   │   ├── generic.js Largest-visible-video heuristic
│   │   │   ├── youtube.js YT SPA navigation events
│   │   │   └── netflix.js DRM-site stub (manual sync mode)
│   │   ├── ui.js          State-machine sidebar UI with draggable mini-mode
│   │   ├── content.js     Orchestrator — wires adapter ↔ UI ↔ background (context-safe)
│   │   └── styles.css     Obsidian Cinema UI (Outfit + DM Mono)
│   └── popup/             Extension toolbar popup
├── build.js               Production packager
└── render.yaml            One-click Render deploy
```

---

## 🔒 Features

- **Host lock** — claim host to be the only one who can control playback
- **Share Links** — generate and copy an invite link to auto-join a room
- **Draggable Mini Mode** — collapse the sidebar into a movable floating widget
- **Drift correction** — soft seek if you're >2 s off; hard sync on join
- **Buffering sync** — pause everyone when one person is buffering
- **DRM graceful degradation** — Netflix/Prime show a "press play together" banner
- **Typing indicators** — with auto-expiry safety net
- **Copy room ID** — one click to clipboard
- **Exponential reconnect** — 1 s → 2 s → 4 s … up to 30 s

---

## 📄 License

MIT
