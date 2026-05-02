# SyncWatch V4 🍿

Welcome to the ultimate synchronized watch party extension! SyncWatch brings production-grade video synchronization to standard HTML5 sites and YouTube SPAs, complete with a glassmorphic sidebar, typing indicators, and user avatars.

---

## 🚀 Step 1: Deploy the Backend (Free & 1-Click)

The SyncWatch backend is a fast, resilient Node.js WebSocket server. It is fully pre-configured to deploy automatically on Render.com's free tier.

**To deploy the backend:**
1. Upload this folder to a new, empty repository on your GitHub account.
2. Click the button below to instantly deploy it:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

3. Once Render finishes building, it will give you a live WebSocket URL (e.g., `wss://syncwatch-backend-abc.onrender.com`). **Copy this URL!**

---

## 📦 Step 2: Build the Extension for Chrome

Now that your server is live, you need to package the Chrome extension so it points to your new server instead of `localhost`.

We have included an automated build script for you. Run the following command in your terminal, replacing the URL with your real Render URL:

```bash
node build.js wss://YOUR_RENDER_URL_HERE.onrender.com
```

This script will:
1. Safely clone your extension.
2. Inject your production Render URL.
3. Compress everything into a highly optimized **`syncwatch-release.zip`** file.

---

## 🌐 Step 3: Launch on the Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Click **Add new item**.
3. Drag and drop your newly generated `syncwatch-release.zip` file.
4. Fill in the store listing details, hit **Submit for Review**, and you're live!

---

### Features
- **Zero-Latency Video Sync**: Real-time play/pause synchronization.
- **YouTube SPA Engine**: Instantly latches onto new videos as you browse YouTube without reloading the page.
- **Glassmorphic Sidebar UI**: Premium dark-mode sidebar overlay.
- **Floating Video Pill**: A subtle "SyncWatch" button sits on top of the video to open the sidebar.
- **Intelligent Identity Engine**: "Quantum Falcon is typing..." (Auto-generated names and avatars).
- **Host Lockdown System**: Lock controls so only you can pause the movie.
