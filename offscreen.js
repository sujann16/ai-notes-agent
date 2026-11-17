let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;
let chunkInterval = null;
let chunkIndex = 0;
let isRecording = false;
let activeSessionId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startAudio") {
    (async () => {
      if (isRecording) {
        console.log("Already recording audio");
        return;
      }

      console.log("START AUDIO RECEIVED IN OFFSCREEN");
      isRecording = true;
      chunkIndex = 0;
      activeSessionId = message.sessionId;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: message.streamId
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: message.streamId
            }
          }
        });

        console.log("STREAM CREATED", stream);
        currentStream = stream;

        // Loopback audio to user (so they can hear the tab audio while recording)
        const audioContext = new AudioContext();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(audioContext.destination);

        // Record only audio tracks from tab capture
        const audioStream = new MediaStream(stream.getAudioTracks());
        
        const startChunkRecorder = () => {
          audioChunks = [];
          mediaRecorder = new MediaRecorder(audioStream);

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            if (audioChunks.length === 0) return;

            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const currentChunkIndex = chunkIndex;
            chunkIndex++;

            // Send chunk to backend
            const formData = new FormData();
            formData.append("sessionId", activeSessionId || "current");
            formData.append("chunkIndex", currentChunkIndex);
            formData.append("timestamp", currentChunkIndex * 15);
            formData.append("audio", audioBlob, `chunk_${currentChunkIndex}.webm`);

            try {
              await fetch("http://localhost:3000/upload-audio-chunk", {
                method: "POST",
                body: formData
              });
              console.log(`Audio chunk ${currentChunkIndex} uploaded successfully`);
            } catch (err) {
              console.error(`Error uploading audio chunk ${currentChunkIndex}:`, err);
            }

            // Restart recorder if still active
            if (isRecording) {
              startChunkRecorder();
            }
          };

          mediaRecorder.start();
        };

        startChunkRecorder();

        // Stop and restart recorder every 15 seconds to send chunks
        chunkInterval = setInterval(() => {
          if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, 15000);

      } catch (err) {
        console.error("Error in offscreen getUserMedia or MediaRecorder:", err);
        isRecording = false;
      }
    })();
    return false;
  }

  if (message.action === "stopAudio") {
    (async () => {
      if (!isRecording) {
        console.log("No active recording to stop");
        chrome.runtime.sendMessage({ action: "audioUploadComplete" });
        return;
      }

      console.log("STOP AUDIO RECEIVED IN OFFSCREEN");
      isRecording = false;

      if (chunkInterval) {
        clearInterval(chunkInterval);
        chunkInterval = null;
      }

      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        // Temporarily override onstop to complete the final upload and finish
        mediaRecorder.onstop = async () => {
          if (audioChunks.length > 0) {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const currentChunkIndex = chunkIndex;
            
            const formData = new FormData();
            formData.append("sessionId", activeSessionId || "current");
            formData.append("chunkIndex", currentChunkIndex);
            formData.append("timestamp", currentChunkIndex * 15);
            formData.append("isFinal", "true");
            formData.append("audio", audioBlob, `chunk_${currentChunkIndex}.webm`);

            try {
              await fetch("http://localhost:3000/upload-audio-chunk", {
                method: "POST",
                body: formData
              });
              console.log(`Final audio chunk ${currentChunkIndex} uploaded`);
            } catch (err) {
              console.error(`Error uploading final chunk ${currentChunkIndex}:`, err);
            }
          }

          if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
          }

          chrome.runtime.sendMessage({ action: "audioUploadComplete" });
        };

        mediaRecorder.stop();
      } else {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
          currentStream = null;
        }
        chrome.runtime.sendMessage({ action: "audioUploadComplete" });
      }
    })();
    return false;
  }
});