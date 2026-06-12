console.log("Popup loaded successfully");
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

        console.log("Response received");

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