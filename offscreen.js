let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;

chrome.runtime.onMessage.addListener(
    async (message) => {

        if (message.action === "startAudio") {
            if (mediaRecorder && mediaRecorder.state === "recording") {
                console.log("Already recording");
                return;
            }

            console.log("START AUDIO RECEIVED");

            try {
                // Capture both audio and video using the tab capture streamId
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

                // 1. Play the audio back to the user (loopback) so they can hear it
                const audioContext = new AudioContext();
                if (audioContext.state === "suspended") {
                    await audioContext.resume();
                }
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(audioContext.destination);

                // 2. Record only the audio tracks from the stream
                const audioStream = new MediaStream(stream.getAudioTracks());
                audioChunks = [];

                mediaRecorder = new MediaRecorder(audioStream);

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                console.log("STARTING RECORDER");
                mediaRecorder.start();
                console.log("Audio recording started");

            } catch (err) {
                console.error("Error in offscreen getUserMedia or MediaRecorder:", err);
            }
        }

        if (message.action === "stopAudio") {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(
                        audioChunks,
                        { type: "audio/webm" }
                    );

                    const formData = new FormData();
                    formData.append(
                        "audio",
                        audioBlob,
                        "lecture.webm"
                    );

                    try {
                        await fetch(
                            "http://localhost:3000/upload-audio",
                            {
                                method: "POST",
                                body: formData
                            }
                        );
                        console.log("Audio uploaded");
                    } catch (err) {
                        console.error("Error uploading audio:", err);
                    }

                    // Clean up and stop all captured media tracks
                    if (currentStream) {
                        currentStream.getTracks().forEach(track => track.stop());
                        currentStream = null;
                    }

                    chrome.runtime.sendMessage({
                        action: "audioUploadComplete"
                    });
                };

                mediaRecorder.stop();
            } else {
                console.log("No active media recorder to stop");
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }
                chrome.runtime.sendMessage({
                    action: "audioUploadComplete"
                });
            }
        }
    }
);