import { StorageManager } from './StorageManager.js';

export const SessionManager = {
  sessionInterval: null,

  async createOffscreen() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Record lecture audio in chunks",
    });
  },

  async startSession(interval, tabId) {
    const state = await StorageManager.get(['recording']);
    if (state.recording) {
      return { success: true, message: "Session already running" };
    }

    let sessionId;
    try {
      const response = await fetch("http://localhost:3000/start-session", { method: "POST" });
      if (!response.ok) {
        throw new Error("Backend server returned error: " + response.status);
      }
      const data = await response.json();
      sessionId = data.sessionId;
      console.log("Backend session initialized, ID:", sessionId);
    } catch (err) {
      console.error("Backend start failed:", err);
      throw new Error("Backend server is unreachable. Please make sure the backend server is running on port 3000.");
    }

    await StorageManager.set({
      recording: true,
      sessionCompleted: false,
      startTime: Date.now(),
      captureInterval: interval,
      lectureTabId: tabId,
      notesGenerated: false,
      sessionId: sessionId
    });

    await this.createOffscreen();

    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tabId },
      async (streamId) => {
        if (chrome.runtime.lastError) {
          console.error("STREAM ID ERROR:", chrome.runtime.lastError);
          await StorageManager.set({ recording: false });
          return;
        }

        console.log("STREAM ID RECEIVED:", streamId);
        chrome.runtime.sendMessage({
          action: "startAudio",
          streamId,
          sessionId: sessionId,
        });
      }
    );

    // Initial frame capture
    await this.captureFrame();

    // Set interval for subsequent frames
    this.sessionInterval = setInterval(() => {
      this.captureFrame();
    }, interval);

    return { success: true };
  },

  async stopSession() {
    if (this.sessionInterval) {
      clearInterval(this.sessionInterval);
      this.sessionInterval = null;
    }

    await StorageManager.set({ recording: false, sessionCompleted: true });

    chrome.runtime.sendMessage({
      action: "stopAudio",
    });

    console.log("Session stopped locally, waiting for final audio uploads");
    return { success: true };
  },

  async resumeSession(interval) {
    if (this.sessionInterval) {
      clearInterval(this.sessionInterval);
    }
    this.sessionInterval = setInterval(() => {
      this.captureFrame();
    }, interval);
    console.log("Session capture resumed");
  },

  async captureFrame() {
    const state = await StorageManager.get(['recording', 'lectureTabId']);
    if (!state.recording) {
      if (this.sessionInterval) {
        clearInterval(this.sessionInterval);
        this.sessionInterval = null;
      }
      return;
    }

    // Capture the active tab of the current window
    chrome.tabs.captureVisibleTab(
      null,
      { format: "jpeg", quality: 80 },
      async (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("Capture visible tab error:", chrome.runtime.lastError);
          return;
        }

        try {
          const state = await StorageManager.get(['sessionId']);
          const response = await fetch("http://localhost:3000/save-frame", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: state.sessionId,
              image: dataUrl.split(",")[1],
            }),
          });
          const data = await response.json();
          console.log("Frame saved to server:", data);
        } catch (err) {
          console.error("Save frame fetch error:", err);
        }
      }
    );
  }
};
