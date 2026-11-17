import { SessionManager } from './SessionManager.js';
import { StorageManager } from './StorageManager.js';

console.log("BACKGROUND WORKER LOADED");

// Resume capturing on startup if recording was active
chrome.storage.local.get(['recording', 'captureInterval'], (state) => {
  if (state.recording && state.captureInterval) {
    SessionManager.resumeSession(state.captureInterval);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSession") {
    (async () => {
      try {
        const targetTabId = message.tabId || (await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        }))[0]?.id;

        if (!targetTabId) {
          console.error("No active tab found to capture");
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }

        const res = await SessionManager.startSession(message.interval || 5000, targetTabId);
        sendResponse(res);
      } catch (err) {
        console.error("Failed to start session:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async sendResponse
  }

  if (message.action === "stopSession") {
    (async () => {
      try {
        const res = await SessionManager.stopSession();
        sendResponse(res);
      } catch (err) {
        console.error("Failed to stop session:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "audioUploadComplete") {
    (async () => {
      try {
        console.log("Notifying backend to stop and finalize the session...");
        const state = await StorageManager.get(['sessionId']);
        const response = await fetch("http://localhost:3000/stop-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ sessionId: state.sessionId })
        });
        const data = await response.json();
        console.log("Backend stop session complete:", data);
      } catch (err) {
        console.error("Backend stop session notification failed:", err);
      }
      
      try {
        await chrome.offscreen.closeDocument();
        console.log("OFFSCREEN DOCUMENT CLOSED - UPLOAD COMPLETE");
      } catch (err) {
        console.error("Error closing offscreen document:", err);
      }
    })();
    return false;
  }

  if (message.action === "getSessionStatus") {
    (async () => {
      const state = await StorageManager.get(['recording']);
      sendResponse({ active: !!state.recording });
    })();
    return true;
  }
});
