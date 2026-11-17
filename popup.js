import { PopupStateManager } from './PopupStateManager.js';
import { StorageManager } from './StorageManager.js';

console.log("Popup loaded successfully");

let currentInterval = null;

// Initialize popup on load
document.addEventListener("DOMContentLoaded", async () => {
  await PopupStateManager.restoreUI();
  
  // Periodically refresh the UI to update elapsed timer
  currentInterval = setInterval(async () => {
    await PopupStateManager.restoreUI();
  }, 1000);
});

// Clean up timer on window unload
window.addEventListener("unload", () => {
  if (currentInterval) {
    clearInterval(currentInterval);
  }
  PopupStateManager.stopProgressTracker();
});

document.getElementById("startSession").addEventListener("click", async () => {
  const startBtn = document.getElementById("startSession");
  if (startBtn.disabled) return;

  const interval = Number(document.getElementById("captureInterval").value);
  console.log("Starting session with interval:", interval);

  document.getElementById("result").innerText = "Starting session...";

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tabId = tab ? tab.id : null;

  chrome.runtime.sendMessage(
    {
      action: "startSession",
      interval: interval,
      tabId: tabId,
    },
    async (response) => {
      console.log("Start response:", response);
      if (response && response.success) {
        await PopupStateManager.restoreUI();
      } else {
        document.getElementById("result").innerText = "Failed to start: " + (response?.error || "Unknown error");
      }
    }
  );
});

document.getElementById("stopSession").addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { action: "stopSession" },
    async (response) => {
      console.log("Stop response:", response);
      await PopupStateManager.restoreUI();
    }
  );
});

document.getElementById("cleanupSession").addEventListener("click", async () => {
  try {
    const state = await StorageManager.get(['sessionId']);
    const response = await fetch("http://localhost:3000/cleanup-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId: state.sessionId })
    });
    const data = await response.json();
    console.log("Cleanup response:", data);
    
    // Clear storage state
    await StorageManager.clear();
    await PopupStateManager.restoreUI();
  } catch (err) {
    console.error("Cleanup failed:", err);
    document.getElementById("notesStatus").innerText = "Cleanup failed: Is the backend running on port 3000?";
  }
});

document.getElementById("generateNotes").addEventListener("click", async () => {
  const notesStatus = document.getElementById("notesStatus");
  notesStatus.innerText = "Generating notes...";
  document.getElementById("generateNotes").disabled = true;

  try {
    const state = await StorageManager.get(['sessionId']);
    const response = await fetch("http://localhost:3000/generate-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionId: state.sessionId })
    });

    const data = await response.json();
    document.getElementById("generateNotes").disabled = false;

    if (data.success) {
      notesStatus.innerText = "Notes generated successfully!";
      // Persist that notes are generated
      await StorageManager.set({ notesGenerated: true });
      await PopupStateManager.restoreUI();
    } else {
      notesStatus.innerText = "Failed to generate notes: " + (data.error || "Unknown error");
    }
  } catch (err) {
    console.error(err);
    document.getElementById("generateNotes").disabled = false;
    notesStatus.innerText = "Server error: Connection refused. Is the backend running on port 3000?";
  }
});

document.getElementById("downloadNotes").addEventListener("click", async () => {
  const state = await StorageManager.get(['sessionId']);
  chrome.tabs.create({
    url: `http://localhost:3000/notes?sessionId=${state.sessionId || ""}&t=${Date.now()}`,
  });
});

document.getElementById("downloadPDF").addEventListener("click", async () => {
  const state = await StorageManager.get(['sessionId']);
  chrome.tabs.create({
    url: `http://localhost:3000/download-pdf?sessionId=${state.sessionId || ""}&t=${Date.now()}`,
  });
});
