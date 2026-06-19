const express = require("express");
const cors = require("cors");
const { Ollama } = require("ollama");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const { exec } =
    require("child_process");

const {
    transcribeAudio
} = require("./transcribe");

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

async function generateLectureNotes(summaries,transcript) {

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

Lecture Transcript:

${transcript}
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

async function generateQuiz(notes) {

    console.log("QUIZ GENERATION STARTED");
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
Generate exactly 5 multiple choice questions.

IMPORTANT:

Return ONLY valid JSON.

Do not include explanations.

Do not include markdown.

Do not include notes.

Return in this format:

{

  "questions": [

    {

      "question": "...",

      "options": [

        "...",

        "...",

        "...",

        "..."

      ],

      "answer": "..."

    }

  ]

}

Notes:

${notes}
`
                }
            ]
        });

    console.log("QUIZ GENERATED");
    return response.message.content;
}

function runScript(command) {

    return new Promise(
        (resolve, reject) => {

            exec(
                command,
                (error, stdout, stderr) => {

                    if (error) {

                        reject(error);
                        return;

                    }

                    resolve(stdout);

                }
            );

        }
    );

}

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

function cosineSimilarity(a, b) {

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {

        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];

    }

    return dot /
        (
            Math.sqrt(magA) *
            Math.sqrt(magB)
        );
}

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

    console.log(
    "Generating transcript..."
);

const transcript =
    await transcribeAudio(
        path.join(
            __dirname,
            "audio",
            "lecture.mp3"
        )
    );

    const notes =
        await generateLectureNotes(
            summaries,
            transcript
        );

    console.log("Sending notes response");
    
    fs.writeFileSync(
        path.join(
            __dirname,
            "lecture-notes.md"
    ),
    notes
   );

   console.log(
    "Saving notes..."
   );

    fs.writeFileSync(
        "lecture-notes.md",
        notes
    );
    
    console.log(
        "Running chunking..."
   );
    
    await runScript(
        "node chunk-notes.js"
    );
    
    console.log(
        "Chunking complete"
   );
    
    console.log(
        "Generating embeddings..."
    );
    
    await runScript(
        "node embed-notes.js"
    );  
    
    console.log(
        "Embeddings complete"
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

app.post("/ask", async (req, res) => {

    try {

        const { question } = req.body;

        console.log(
            "Question:",
            question
        );

        const embeddings =
            JSON.parse(
                fs.readFileSync(
                    "embeddings.json",
                    "utf8"
                )
            );

        const queryEmbedding =
            await ollama.embed({
                model:
                "nomic-embed-text",
                input:
                question
            });

        const queryVector =
            queryEmbedding.embeddings[0];

        const scored =
            embeddings.map(chunk => ({
                ...chunk,
                score:
                    cosineSimilarity(
                        queryVector,
                        chunk.embedding
                    )
            }));

        scored.sort(
            (a, b) =>
                b.score - a.score
        );

        const topChunks =
            scored.slice(0, 3);

        const context =
            topChunks
                .map(c => c.text)
                .join("\n\n");

        const answer =
            await ollama.chat({
                model: "qwen3:4b",
                messages: [
                    {
                        role: "user",
                        content: `
Answer ONLY using the context below.

Context:

${context}

Question:

${question}
`
                    }
                ]
            });

        res.json({
            success: true,
            answer:
            answer.message.content
        });

    } catch(err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

app.post("/generate-quiz", async (req, res) => {

    console.log("GENERATE QUIZ HIT");
    try {

        console.log("Reading lecture notes");
        const notes =
            fs.readFileSync(
                "lecture-notes.md",
                "utf8"
            )
            .slice(0,3000);
        console.log("Lecture notes loaded");

        console.log(
            "Notes length:",
            notes.length
        );
        const quiz =
    await generateQuiz(
        notes
    );

let parsedQuiz;

try {

    const cleaned =
        quiz
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

    parsedQuiz =
        JSON.parse(cleaned);

} catch {

    parsedQuiz = {
        raw: quiz
    };

}

res.json({
    success: true,
    quiz: parsedQuiz
});

    } catch(err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

app.get("/notes", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "lecture-notes.md"
        )
    );

});


app.post(
    "/transcribe-audio",
    async (req, res) => {

        try {

            console.log(
                "TRANSCRIBE HIT"
            );

            const transcript =
                await transcribeAudio(
                    path.join(
                        __dirname,
                        "audio",
                        "lecture.mp3"
                    )
                );

            res.json({
                success: true,
                transcript
            });

        } catch(err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);

app.get("/download-pdf", (req, res) => {

    try {

        const notesPath =
            path.join(
                __dirname,
                "lecture-notes.md"
            );

        if (!fs.existsSync(notesPath)) {

            return res.status(404).json({
                success: false,
                error: "Notes not found"
            });

        }

        const notes =
            fs.readFileSync(
                notesPath,
                "utf8"
            );

        const doc =
            new PDFDocument();

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=LectureNotes.pdf"
        );

        doc.pipe(res);

        doc.fontSize(20);
        doc.text(
            "AI Learning Agent Notes"
        );

        doc.moveDown();

        doc.fontSize(12);
        doc.text(notes);

        doc.end();

    } catch(err) {

        console.error(err);

        res.status(500).json({
            success: false
        });

    }

});


app.listen(3000, () => {
    console.log("Server running on port 3000");
});