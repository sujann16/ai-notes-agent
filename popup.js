console.log("Popup loaded successfully");

let sessionActive = false;
let sessionInterval = null;

// async function startAudioRecording() {

//     console.log(
//     "START AUDIO FUNCTION CALLED"
// );
//     chrome.tabCapture.capture(
//         {
//             audio: true,
//             video: false
//         },
//         (stream) => {

//             if (
//                 chrome.runtime.lastError
//             ) {

//                 console.error(
//                     chrome.runtime.lastError
//                 );

//                 return;

//             }

//             console.log(
//                 "Audio recording started"
//             );

//             audioStream = stream;

//             audioChunks = [];

//             mediaRecorder =
//                 new MediaRecorder(
//                     stream
//                 );

//             mediaRecorder.ondataavailable =
//                 (event) => {

//                     if (
//                         event.data.size > 0
//                     ) {

//                         audioChunks.push(
//                             event.data
//                         );

//                     }

//                 };

//                 mediaRecorder.onstop =
//     async () => {

//         console.log(
//             "Preparing audio file"
//         );

//         const audioBlob =
//             new Blob(
//                 audioChunks,
//                 {
//                     type:
//                     "audio/webm"
//                 }
//             );

//         console.log(
//             "Audio Blob Size:",
//             audioBlob.size
//         );

//     };

//             mediaRecorder.start();

//         }
//     );

// }

async function captureAndSendFrame() {
  console.log("STEP 1: Function called");

  chrome.tabs.captureVisibleTab(null, { format: "png" }, async (dataUrl) => {
    console.log("STEP 2: Screenshot captured");

    try {
      const img = new Image();

      img.onload = async () => {
        const canvas = document.createElement("canvas");

        canvas.width = 640;
        canvas.height = 360;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, 640, 360);

        const compressed = canvas.toDataURL("image/jpeg", 0.5);

        const base64Image = compressed.split(",")[1];

        console.log("Compressed size:", base64Image.length);

        const response = await fetch("http://localhost:3000/save-frame", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: base64Image,
          }),
        });

        const data = await response.json();

        console.log("Frame saved:", data);
      };

      img.src = dataUrl;
    } catch (err) {
      console.error(err);
    }
  });
}

// document
// .getElementById("checkVideo")
// .addEventListener("click", async () => {

//     const [tab] =
//     await chrome.tabs.query({
//         active:true,
//         currentWindow:true
//     });

//     chrome.scripting.executeScript(
//     {
//         target:{
//             tabId:tab.id
//         },
//         func: () => {

//     const video = document.querySelector("video");

//     if (!video) {
//         return {
//             found: false
//         };
//     }

//     return {
//         found: true,
//         currentTime: video.currentTime,
//         duration: video.duration,
//         paused: video.paused,
//         playbackRate: video.playbackRate
//     };
// }
//     },
//     (results) => {

//         document
//         .getElementById("result")
//         .innerText =
//         JSON.stringify(
//             results[0].result,
//             null,
//             2
//         );

//     });

// });

// document
// .getElementById("pingBackend")
// .addEventListener("click", async () => {

//     console.log("Ping button clicked");

//     try {
//         const response = await fetch("http://localhost:3000");

//         console.log("Response received",
//         response.status);
//         const data = await response.json();

//         console.log(data);

//         document.getElementById("result").innerText =
//             JSON.stringify(data, null, 2);

//     } catch (err) {
//         console.error(err);
//     }
// });

// document
// .getElementById("captureFrame")
// .addEventListener("click", () => {

//     console.log("Capture clicked");

//     chrome.tabs.captureVisibleTab(
//         null,
//         { format: "png" },
//         (dataUrl) => {

//             if (chrome.runtime.lastError) {

//                 console.error(
//                     chrome.runtime.lastError
//                 );

//                 document
//                 .getElementById("result")
//                 .innerText =
//                 chrome.runtime.lastError.message;

//                 return;
//             }

//             console.log(
//                 dataUrl.substring(0, 100)
//             );

//             document
//             .getElementById("result")
//             .innerText =
//             "Screenshot captured!";
//         }
//     );

// });

// document
// .getElementById("analyzeFrame")
// .addEventListener("click", async () => {

//     chrome.tabs.captureVisibleTab(
//     null,
//     { format: "png" },
//     async (dataUrl) => {

//         const img = new Image();

//         img.onload = async () => {

//             const canvas =
//                 document.createElement("canvas");

//             canvas.width = 640;
//             canvas.height = 360;

//             const ctx =
//                 canvas.getContext("2d");

//             ctx.drawImage(
//                 img,
//                 0,
//                 0,
//                 640,
//                 360
//             );

//             const compressed =
//                 canvas.toDataURL(
//                     "image/jpeg",
//                     0.5
//                 );

//             const base64Image =
//                 compressed.split(",")[1];

//             console.log(
//                 "Compressed size:",
//                 base64Image.length
//             );

//             document
//             .getElementById("result")
//             .innerText =
//             "Analyzing...";

//             try {

//                 const response =
//                     await fetch(
//                         "http://localhost:3000/analyze-frame",
//                         {
//                             method: "POST",
//                             headers: {
//                                 "Content-Type":
//                                 "application/json"
//                             },
//                             body: JSON.stringify({
//                                 image: base64Image
//                             })
//                         }
//                     );

//                 const data =
//                     await response.json();

//                 document
//                 .getElementById("result")
//                 .innerText =
//                 data.analysis;

//             } catch(err) {

//                 console.error(err);

//                 document
//                 .getElementById("result")
//                 .innerText =
//                 err.message;
//             }
//         };

//         img.src = dataUrl;

//     }
// );

// });

document.getElementById("startSession").addEventListener("click", async () => {
  if (sessionActive) return;

  sessionActive = true;

  try {
    await fetch("http://localhost:3000/cleanup-session", { method: "POST" });
    console.log("Old session data cleaned up successfully");
  } catch (err) {
    console.error("Auto-cleanup failed:", err);
  }

  const interval = Number(document.getElementById("captureInterval").value);

  console.log("Session started");

  document.getElementById("result").innerText = `Session Started

Capture Every ${interval / 1000} sec`;

  console.log("CALLING AUDIO");

  captureAndSendFrame();

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
    (response) => {
      console.log(response);
    },
  );

  document.getElementById("result").innerText = "Session Started";
});

document.getElementById("stopSession").addEventListener("click", () => {
  clearInterval(sessionInterval);

  sessionActive = false;

  chrome.runtime.sendMessage(
    {
      action: "stopSession",
    },
    (response) => {
      console.log(response);
    },
  );

  document.getElementById("result").innerText = "Session Stopped";
});

document
  .getElementById("cleanupSession")
  .addEventListener("click", async () => {
    const response = await fetch("http://localhost:3000/cleanup-session", {
      method: "POST",
    });

    const data = await response.json();

    console.log(data);
  });
// document
// .getElementById("askBtn")
// .addEventListener(
//     "click",
//     async () => {

//         const question =
//             document
//             .getElementById(
//                 "question"
//             )
//             .value;

//         const response =
//             await fetch(
//                 "http://localhost:3000/ask",
//                 {
//                     method: "POST",
//                     headers: {
//                         "Content-Type":
//                         "application/json"
//                     },
//                     body:
//                     JSON.stringify({
//                         question
//                     })
//                 }
//             );

//         const data =
//             await response.json();

//         document
//         .getElementById(
//             "answer"
//         )
//         .innerText =
//         data.answer;

//     }
// );

// document
// .getElementById("generateQuiz")
// .addEventListener(
//     "click",
//     async () => {

//         const response =
//             await fetch(
//                 "http://localhost:3000/generate-quiz",
//                 {
//                     method: "POST"
//                 }
//             );

//         const data =
//             await response.json();

//         console.log(data);

// let output = "";

// console.log(
//     data.quiz.questions
// );

// alert(
//     `Questions found: ${data.quiz.questions.length}`
// );

// data.quiz.questions.forEach(
//     (q, index) => {

//         output +=
//             `Q${index + 1}. ${q.question}\n\n`;

//         console.log("Question:", q);
// console.log("Options:", q.options);

// if (Array.isArray(q.options)) {

//     q.options.forEach(
//         option => {

//             output += `${option}\n`;

//         }
//     );

// } else {

//     output +=
//         "No options found\n";

// }

//         output +=
//             `\nAnswer: ${q.answer}\n`;

//         output +=
//             "\n----------------------\n\n";

//     }
// );

// document
// .getElementById(
//     "quizOutput"
// )
// .innerText =
// output;

//     }
// );

document.getElementById("generateNotes").addEventListener("click", async () => {
  document.getElementById("notesStatus").innerText = "Generating notes...";

  try {
    const response = await fetch("http://localhost:3000/generate-notes", {
      method: "POST",
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById("notesStatus").innerText =
        "Notes generated successfully!";
    } else {
      document.getElementById("notesStatus").innerText =
        "Failed to generate notes";
    }
  } catch (err) {
    console.error(err);

    document.getElementById("notesStatus").innerText = "Server error";
  }
});

document.getElementById("downloadNotes").addEventListener("click", () => {
  chrome.tabs.create({
    url: "http://localhost:3000/download-pdf?t=" + Date.now(),
  });
});

// document
// .getElementById("testAudio")
// .addEventListener(
//     "click",
//     async () => {

//         chrome.tabCapture.capture(
//             {
//                 audio: true,
//                 video: false
//             },
//             (stream) => {

//                 if (
//                     chrome.runtime.lastError
//                 ) {

//                     console.error(
//                         chrome.runtime.lastError
//                     );

//                     return;

//                 }

//                 console.log(
//                     "AUDIO STREAM WORKS",
//                     stream
//                 );

//             }
//         );

//     }
// );
