console.log("BACKGROUND WORKER LOADED");

let sessionInterval = null;
let recording = false;
let lectureTabId = null;
let offscreenCreated = false;

async function createOffscreen() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record lecture audio",
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSession") {
    if (recording) {
      sendResponse({
        success: true,
        message: "Session already running",
      });

      return false;
    }

    recording = true;

    (async () => {
      try {
        await createOffscreen();

        console.log("REQUESTING STREAM ID");

        const targetTabId = message.tabId || (await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        }))[0]?.id;

        if (!targetTabId) {
          console.error("No active tab found to capture");
          recording = false;
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }

        lectureTabId = targetTabId;

        chrome.tabs.get(
          lectureTabId,
          (tab) => {
            console.log(
              "Capturing:",
              tab.url
            );
          }
        );

        chrome.tabCapture.getMediaStreamId(
          {
            targetTabId: lectureTabId,
          },
          (streamId) => {
            if (chrome.runtime.lastError) {
              console.error("STREAM ID ERROR:", chrome.runtime.lastError);
              recording = false;
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
              return;
            }

            console.log("STREAM ID:", streamId);

            chrome.runtime.sendMessage({
              action: "startAudio",
              streamId,
            });

            sendResponse({
              success: true,
            });
          },
        );

        const interval = message.interval || 5000;

        console.log("SESSION STARTED");

        sessionInterval = setInterval(async () => {
          console.log("CAPTURE FRAME");

          chrome.tabs.captureVisibleTab(
            null,
            {
              format: "png",
            },
            async (dataUrl) => {
              if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);

                return;
              }

              try {
                const response = await fetch("http://localhost:3000/save-frame", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    image: dataUrl.split(",")[1],
                  }),
                });

                const data = await response.json();

                console.log("FRAME SAVED:", data);
              } catch (err) {
                console.error("SAVE FRAME ERROR:", err);
              }
            },
          );
        }, interval);

      } catch (err) {
        console.error("Failed to start session:", err);
        recording = false;
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // Keep message channel open for async sendResponse
  }

  if (message.action === "stopSession") {
    recording = false;

    if (sessionInterval) {
      clearInterval(sessionInterval);
      sessionInterval = null;
    }

    chrome.runtime.sendMessage({
      action: "stopAudio",
    });

    console.log("SESSION STOPPING, WAITING FOR AUDIO UPLOAD");

    sendResponse({
      success: true,
    });

    return false;
  }

  if (message.action === "audioUploadComplete") {
    chrome.offscreen.closeDocument()
      .then(() => {
        console.log("OFFSCREEN DOCUMENT CLOSED - UPLOAD COMPLETE");
      })
      .catch((err) => {
        console.error("Error closing offscreen document:", err);
      });
    return false;
  }

  if (message.action === "getSessionStatus") {
    sendResponse({
      active: recording,
    });

    return false;
  }
});
