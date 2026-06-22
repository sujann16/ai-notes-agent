let mediaRecorder = null;
let audioChunks = [];

chrome.runtime.onMessage.addListener(
    async (message) => {

        if(message.action === "startAudio") {

            if(mediaRecorder &&

       mediaRecorder.state === "recording") {

        console.log(

            "Already recording"

        );

        return;

    }

    console.log(
    "START AUDIO RECEIVED"
);
            const stream =
                await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: "tab",
                            chromeMediaSourceId:
                                message.streamId
                        }
                    },
                    video: false
                });

                console.log(
    "STREAM CREATED",
    stream
);

            audioChunks = [];

            mediaRecorder =
                new MediaRecorder(stream);

            mediaRecorder.ondataavailable =
                (event) => {

                    if(event.data.size > 0){

                        audioChunks.push(
                            event.data
                        );

                    }

                };

                console.log(
    "STARTING RECORDER"
);

            mediaRecorder.start();

            console.log(
                "Audio recording started"
            );
        }

        if(message.action === "stopAudio") {

            

            mediaRecorder.onstop =
            async () => {

                const audioBlob =
                    new Blob(
                        audioChunks,
                        {
                            type:
                            "audio/webm"
                        }
                    );

                const formData =
                    new FormData();

                formData.append(
                    "audio",
                    audioBlob,
                    "lecture.webm"
                );

                await fetch(
                    "http://localhost:3000/upload-audio",
                    {
                        method:"POST",
                        body:formData
                    }
                );

                console.log(
                    "Audio uploaded"
                );
            };

            mediaRecorder.stop();
        }

    }
);