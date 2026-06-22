console.log("BACKGROUND WORKER LOADED");

let sessionInterval = null;
let recording = false;
let lectureTabId = null;
let offscreenCreated = false;

async function createOffscreen() {
  if (offscreenCreated) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record lecture audio",
  });

  offscreenCreated = true;
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "startSession") {
    if (recording) {
      sendResponse({
        success: true,
        message: "Session already running",
      });

      return true;
    }

    recording = true;

    await createOffscreen();

    console.log("REQUESTING STREAM ID");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });



lectureTabId = tab.id;

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
        targetTabId: tab.id,
      },
      (streamId) => {
        if (chrome.runtime.lastError) {
          console.error("STREAM ID ERROR:", chrome.runtime.lastError);
          return;
        }

        console.log("STREAM ID:", streamId);

        chrome.runtime.sendMessage({
          action: "startAudio",
          streamId,
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

    sendResponse({
      success: true,
    });

    return true;
  }

  if (message.action === "stopSession") {
    recording = false;

    clearInterval(sessionInterval);

    sessionInterval = null;

    chrome.runtime.sendMessage({
      action: "stopAudio",
    });

    console.log("SESSION STOPPED");

    sendResponse({
      success: true,
    });

    return true;
  }

  if (message.action === "getSessionStatus") {
    sendResponse({
      active: recording,
    });

    return true;
  }
});
