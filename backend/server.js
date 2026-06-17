const express = require("express");
const cors = require("cors");
const { Ollama } = require("ollama");
const fs = require("fs");
const path = require("path");

const ollama = new Ollama({
    host: "http://127.0.0.1:11434"
});

const app = express();

app.use(cors());

app.use(express.json({
    limit: "20mb"
}));

app.get("/", (req, res) => {
    res.json({
        status: "AI Learning Agent Backend Running"
    });
});

app.post("/analyze-frame", async (req, res) => {
    console.log("Analyze endpoint hit");
    try {

        const { image } = req.body;
         console.log("Image received");

        console.log(image?.length);
        const response = await ollama.chat({
            model: "qwen2.5vl:3b",
            options: {
                num_ctx: 8192
            }, 
            messages: [
                {
                    role: "user",
                    content: `
Analyze this lecture slide.

Return:
1. Title
2. Key Concepts
3. Summary
`,
                    images: [image]
                }
            ]
        });

        res.json({
            success: true,
            analysis: response.message.content
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

app.post("/save-frame", async (req, res) => {

    console.log("SAVE FRAME HIT");

    try {

        const { image } = req.body;

        console.log(
            "Image Length:",
            image?.length
        );

        const framesDir =
            path.join(
                __dirname,
                "uploads",
                "frames"
            );

        if (!fs.existsSync(framesDir)) {

            fs.mkdirSync(
                framesDir,
                { recursive: true }
            );

        }

        const fileName =
            `frame_${Date.now()}.jpg`;

        const filePath =
            path.join(
                framesDir,
                fileName
            );

        fs.writeFileSync(
            filePath,
            image,
            "base64"
        );

        console.log(
            "Saved:",
            filePath
        );

        res.json({
            success: true,
            file: fileName
        });

    } catch(err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});