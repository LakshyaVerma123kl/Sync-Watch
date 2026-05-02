I want to build a browser extension (Chrome-first, later cross-browser) that enables multiple users to watch video content together in sync across the internet, similar to Teleparty, but with broader compatibility.

🎯 Goal

Create a “watch together” experience where users can join a shared room and have synchronized playback (play, pause, seek) across supported websites.

🌐 Core Requirement

The extension should work on:

- YouTube
- Instagram (videos/reels where possible)
- Generic HTML5 video websites
- Third-party streaming sites (e.g., NetMirror-type sites)

It does NOT need to bypass DRM or illegally access content. Each user will play content locally in their own browser.

⚙️ Key Features

1. Video Detection Engine

- Automatically detect video elements ("<video>") on any webpage
- Handle dynamically loaded content using MutationObserver
- Attempt detection inside iframes where possible
- Fallback mechanism if no direct video access is available

2. Synchronization System

- Sync play, pause, and seek events across users
- Use WebSockets (or similar real-time protocol)
- Implement latency handling and drift correction
- Prevent infinite event loops (e.g., using sync flags)

3. Room System

- Users can create or join rooms via unique IDs or links
- Optional host system (one user controls playback)
- Support multiple participants per room

4. Fallback Mode (Important)

- If video cannot be controlled directly:
  - Sync timestamps only
  - Show prompts like “Click play to sync”
  - Provide manual resync button

5. UI Overlay

- Inject a minimal UI into the page:
  - Create / Join Room
  - Display room ID
  - Sync status (connected, syncing, fallback mode)
- Optional chat feature

6. Site Adapter Architecture

- Use a modular system:
  - Generic adapter (for most HTML5 video sites)
  - Custom adapters for specific platforms (YouTube, Instagram, etc.)
- Allow easy addition of new site-specific logic

7. Backend

- WebSocket-based server (Node.js preferred)
- Room-based event broadcasting
- Scalable architecture for multiple rooms

🚧 Constraints & Limitations

- Must NOT bypass DRM (Netflix, Prime Video, etc.)
- Must comply with browser extension policies
- Should handle frequent DOM changes on websites
- Should gracefully degrade when full control is not possible

🚀 MVP Scope

Start with:

- Chrome extension
- Generic HTML5 video support
- YouTube support
- Basic room system
- Basic sync (play/pause/seek)

🔮 Future Enhancements

- Chat system
- Voice/video communication
- Cross-browser support
- Mobile support
- Smart buffering sync
- UI/UX improvements

🧠 Technical Stack Preference

- Frontend: JavaScript / TypeScript (Chrome Extension APIs)
- Backend: Node.js with WebSocket (Socket.IO optional)

❓ What I need help with

- Architecture design
- Starter code for extension + backend
- Video detection strategies across sites
- Sync logic and drift correction
- UI design for extension overlay
- Scaling and production considerations

Build this as a modular, scalable system rather than a quick hack.