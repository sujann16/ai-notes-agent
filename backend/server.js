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

async function analyzeFrame(imagePath) {

     console.log(
        "Reading:",
        imagePath
    );

    const image =
        fs.readFileSync(imagePath)
          .toString("base64");

    console.log(
        "Sending to Qwen..."
    );

    const response =
        await ollama.chat({
            model: "qwen2.5vl:3b",
            messages: [
                {
                    role: "user",
                    content: `
Analyze this lecture slide.

Return:
- Title
- Key Concepts
- Important Definitions
- Summary
`,
                    images: [image]
                }
            ]
        });

        console.log(
        "Qwen finished"
    );

    return response.message.content;
}

async function generateLectureNotes(summaries) {

    console.log("Generating final notes...");

    const response =
        await ollama.chat({
            model: "qwen3:4b",
            options: {
                num_ctx: 2048
            },
            messages: [
                {
                    role: "user",
                    content: `
Generate comprehensive study notes from these lecture slide summaries.

Include:

1. Topic
2. Key Concepts
3. Detailed Explanation
4. Important Definitions
5. Interview Questions
6. Revision Notes

Slide Summaries:

${summaries.join("\n\n")}
`
                }
            ]
        });

    console.log("Qwen3 finished");

    return response.message.content;
}

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
    console.log(
    "Notes generated"
);

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

app.post("/generate-notes", async (req, res) => {

    console.log("GENERATE NOTES HIT");
    try {

        const framesDir =
            path.join(
                __dirname,
                "uploads",
                "frames"
            );

        const files =
            fs.readdirSync(framesDir)
              .slice(0, 2);

        let summaries = [];

        for (const file of files) {

            console.log(
                "Analyzing:",
                file
            );

            const result =
                await analyzeFrame(
                    path.join(
                        framesDir,
                        file
                    )
                );
                console.log("Summary generated for:",file);

            summaries.push(result);

        }

        console.log(
    "All summaries complete"
);

    const notes =
        await generateLectureNotes(
            summaries
        );

    console.log("Sending notes response");
    
    fs.writeFileSync(
        path.join(
            __dirname,
            "lecture-notes.md"
    ),
    notes
   );
    res.json({
        success: true,
        notes
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