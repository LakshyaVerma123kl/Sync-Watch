# SyncWatch - Synchronized Watch Extension

SyncWatch is a Chrome extension that allows multiple users to watch video content together in sync across the internet. It currently supports generic HTML5 videos and YouTube.

## Features
- Create or join shared rooms via a unique Room ID.
- Automatically detects video elements using MutationObservers.
- Seamlessly synchronizes play, pause, and seek events across all clients in the room.
- Minimal, premium glassmorphic UI overlay injected directly into the video page.
- Native WebSocket backend for fast, real-time broadcasting.

## Architecture

1. **Backend Server (`/backend`)**: A lightweight Node.js Express server utilizing the native `ws` WebSocket library. It manages active rooms and broadcasts sync events (play/pause/seek) to clients to keep them in sync.
2. **Chrome Extension (`/extension`)**: A Manifest V3 compliant extension.
   - **Background Script**: Connects to the WebSocket server and acts as a persistent message broker.
   - **Content Scripts**: Injects the UI overlay and the specific site adapters (`generic.js` and `youtube.js`) to find and control the video elements on the page.

## Local Development Setup

### Backend
1. Open a terminal and navigate to the `backend` directory.
2. Run `npm install` to install dependencies.
3. Run `npm start` to start the local WebSocket server on `http://localhost:3000`.

### Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" in the top right corner.
3. Click "Load unpacked" and select the `extension` folder from this project.
4. Open any video site (e.g., YouTube), and you should see the SyncWatch overlay in the bottom right corner.

---

## Free Deployment Guide

To use this extension with friends across the internet, you must deploy the backend server to a cloud provider. We recommend **Render.com** for the best free-tier WebSocket support.

### 1. Deploying the Backend to Render (Free)

Render offers a free Web Service tier which is perfect for Node.js WebSocket servers.

1. Create a free account at [Render.com](https://render.com).
2. Upload this entire project repository to a GitHub account (make it public or private).
3. On Render, click **New +** and select **Web Service**.
4. Connect your GitHub repository.
5. Configure the Web Service:
   - **Name**: `syncwatch-backend` (or similar)
   - **Environment**: `Node`
   - **Root Directory**: `backend` (Important! Make sure Render knows the server is in the `backend` folder).
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Select the **Free** instance type and click **Create Web Service**.
7. Once deployed, Render will give you a public URL (e.g., `https://syncwatch-backend.onrender.com`).

*Note: Render's free tier will spin down the server after 15 minutes of inactivity. The first person to connect after it spins down might experience a 30-60 second delay while the server wakes up.*

### 2. Updating the Extension URL

Once you have your live backend URL from Render, you need to point the Chrome extension to it.

1. Open `extension/background/background.js` in a code editor.
2. Change the `SERVER_URL` on line 3:
   ```javascript
   // Change from localhost to your new Render URL. Must use 'wss://' for secure websockets!
   const SERVER_URL = 'wss://syncwatch-backend.onrender.com';
   ```
3. Save the file.
4. Go back to `chrome://extensions/` and click the **Reload** icon on the SyncWatch extension card.
5. You can now zip the `extension` folder and send it to your friends to load into their browsers!
