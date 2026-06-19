let audioStream = null;

let mediaRecorder = null;

let audioChunks = [];


console.log(
    "BACKGROUND WORKER LOADED"
);

let recording = false;

async function startAudioRecording() {

    chrome.tabCapture.capture(
        {
            audio: true,
            video: false
        },
        (stream) => {

            if (
                chrome.runtime.lastError
            ) {

                console.error(
                    chrome.runtime.lastError
                );

                return;

            }

            console.log(
                "AUDIO RECORDING STARTED"
            );

            audioStream = stream;

            audioChunks = [];

            mediaRecorder =
                new MediaRecorder(
                    stream
                );

            mediaRecorder.ondataavailable =
                (event) => {

                    if (
                        event.data.size > 0
                    ) {

                        audioChunks.push(
                            event.data
                        );

                    }

                };

            mediaRecorder.onstop =
                () => {

                    console.log(
                        "AUDIO SIZE:",
                        audioChunks.length
                    );

                };

            mediaRecorder.start();

        }
    );

}

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        if (
            message.action ===
            "startSession"
        ) {

            recording = true;
            startAudioRecording();
            console.log(
                "SESSION STARTED"
            );

            sendResponse({
                success: true
            });

        }

        if (
            message.action ===
            "stopSession"
        ) {

            recording = false;
            if (mediaRecorder) {

    mediaRecorder.stop();

}

            console.log(
                "SESSION STOPPED"
            );

            sendResponse({
                success: true
            });

        }

    }
);