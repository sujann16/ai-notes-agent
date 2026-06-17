
console.log("Popup loaded successfully")

let sessionActive = false;

let sessionInterval = null;

async function captureAndSendFrame() {

    console.log("STEP 1: Function called");

    chrome.tabs.captureVisibleTab(
        null,
        { format: "png" },
        async (dataUrl) => {

            console.log("STEP 2: Screenshot captured");

            try {

                const img = new Image();

                img.onload = async () => {

                    const canvas =
                        document.createElement(
                            "canvas"
                        );

                    canvas.width = 640;
                    canvas.height = 360;

                    const ctx =
                        canvas.getContext("2d");

                    ctx.drawImage(
                        img,
                        0,
                        0,
                        640,
                        360
                    );

                    const compressed =
                        canvas.toDataURL(
                            "image/jpeg",
                            0.5
                        );

                    const base64Image =
                        compressed
                        .split(",")[1];

                    console.log(
                        "Compressed size:",
                        base64Image.length
                    );

                    const response =
                        await fetch(
                            "http://localhost:3000/save-frame",
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type":
                                    "application/json"
                                },
                                body:
                                JSON.stringify({
                                    image:
                                    base64Image
                                })
                            }
                        );

                    const data =
                        await response.json();

                    console.log(
                        "Frame saved:",
                        data
                    );

                };

                img.src = dataUrl;

            } catch(err) {

                console.error(err);

            }

        }
    );

}

document
.getElementById("checkVideo")
.addEventListener("click", async () => {

    const [tab] =
    await chrome.tabs.query({
        active:true,
        currentWindow:true
    });

    chrome.scripting.executeScript(
    {
        target:{
            tabId:tab.id
        },
        func: () => {

    const video = document.querySelector("video");

    if (!video) {
        return {
            found: false
        };
    }

    return {
        found: true,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        playbackRate: video.playbackRate
    };
}
    },
    (results) => {

        document
        .getElementById("result")
        .innerText =
        JSON.stringify(
            results[0].result,
            null,
            2
        );

    });

});

document
.getElementById("pingBackend")
.addEventListener("click", async () => {

    console.log("Ping button clicked");

    try {
        const response = await fetch("http://localhost:3000");

        console.log("Response received",
        response.status);
        const data = await response.json();

        console.log(data);

        document.getElementById("result").innerText =
            JSON.stringify(data, null, 2);

    } catch (err) {
        console.error(err);
    }
});

document
.getElementById("captureFrame")
.addEventListener("click", () => {

    console.log("Capture clicked");

    chrome.tabs.captureVisibleTab(
        null,
        { format: "png" },
        (dataUrl) => {

            if (chrome.runtime.lastError) {

                console.error(
                    chrome.runtime.lastError
                );

                document
                .getElementById("result")
                .innerText =
                chrome.runtime.lastError.message;

                return;
            }

            console.log(
                dataUrl.substring(0, 100)
            );

            document
            .getElementById("result")
            .innerText =
            "Screenshot captured!";
        }
    );

});

document
.getElementById("analyzeFrame")
.addEventListener("click", async () => {

    chrome.tabs.captureVisibleTab(
    null,
    { format: "png" },
    async (dataUrl) => {

        const img = new Image();

        img.onload = async () => {

            const canvas =
                document.createElement("canvas");

            canvas.width = 640;
            canvas.height = 360;

            const ctx =
                canvas.getContext("2d");

            ctx.drawImage(
                img,
                0,
                0,
                640,
                360
            );

            const compressed =
                canvas.toDataURL(
                    "image/jpeg",
                    0.5
                );

            const base64Image =
                compressed.split(",")[1];

            console.log(
                "Compressed size:",
                base64Image.length
            );

            document
            .getElementById("result")
            .innerText =
            "Analyzing...";

            try {

                const response =
                    await fetch(
                        "http://localhost:3000/analyze-frame",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                "application/json"
                            },
                            body: JSON.stringify({
                                image: base64Image
                            })
                        }
                    );

                const data =
                    await response.json();

                document
                .getElementById("result")
                .innerText =
                data.analysis;

            } catch(err) {

                console.error(err);

                document
                .getElementById("result")
                .innerText =
                err.message;
            }
        };

        img.src = dataUrl;

    }
);

});

document
.getElementById("startSession")
.addEventListener(
    "click",
    () => {

        if(sessionActive)
            return;

        sessionActive = true;

        captureAndSendFrame();

        sessionInterval =

            setInterval(

                captureAndSendFrame,
                15000
    );

        document
        .getElementById("result")
        .innerText =
        "Session Started";

    }
);

document
.getElementById("stopSession")
.addEventListener(
    "click",
    () => {

        clearInterval(
            sessionInterval
        );

        sessionActive =
            false;

        document
        .getElementById("result")
        .innerText =
        "Session Stopped";

    }
);