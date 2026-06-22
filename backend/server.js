const express = require("express");
const cors = require("cors");
const { Ollama } = require("ollama");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const { exec } =
    require("child_process");

const {
    transcribeAudio
} = require("./transcribe");

const ollama = new Ollama({
    host: "http://127.0.0.1:11434"
});

const storage =
multer.diskStorage({

    destination:
    (
        req,
        file,
        cb
    ) => {
        const dir = path.join(__dirname, "audio");
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(
            null,
            dir
        );

    },

    filename:
    (
        req,
        file,
        cb
    ) => {

        cb(
            null,
            "lecture.webm"
        );

    }

});

const audioUpload =
multer({
    storage
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

app.post(
    "/upload-audio",
    audioUpload.single("audio"),
    (req,res) => {

        console.log(
            "Audio saved:",
            req.file.path
        );

        res.json({
            success:true,
            file:req.file.path
        });

    }
);

app.post("/generate-notes", async (req, res) => {

    console.log("GENERATE NOTES HIT");
    try {

        const framesDir =
            path.join(
                __dirname,
                "uploads",
                "frames"
            );

        const files = fs.readdirSync(framesDir)
            .filter(file => file.endsWith(".jpg"))
            .map(name => ({
                name,
                time: fs.statSync(path.join(framesDir, name)).mtime.getTime()
            }))
            .sort((a, b) => a.time - b.time)
            .map(f => f.name)
            .slice(-3);

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
            "lecture.webm"
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
        `node "${path.join(__dirname, "chunk-notes.js")}"`
    );
    
    console.log(
        "Chunking complete"
   );
    
    console.log(
        "Generating embeddings..."
    );
    
    await runScript(
        `node "${path.join(__dirname, "embed-notes.js")}"`
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
                        "lecture.webm"
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

function cleanUnicode(text) {
    if (!text) return "";
    return text
        .replace(/💡/g, "Tip: ")
        .replace(/❌/g, " [X] ")
        .replace(/✅/g, " [OK] ")
        .replace(/→/g, "->")
        .replace(/➔/g, "->")
        .replace(/⇒/g, "=>")
        .replace(/•/g, "*")
        .replace(/[\u2018\u2019]/g, "'") // smart quotes
        .replace(/[\u201C\u201D]/g, '"') // smart double quotes
        .replace(/[^\x00-\x7F]/g, ""); // strip any remaining non-ASCII characters to prevent rendering boxes/garbage
}

function checkPageSpace(doc, neededSpace) {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;
    if (doc.y + neededSpace > pageHeight - bottomMargin) {
        doc.addPage();
    }
}

function parseInlineStyles(text) {
    const spans = [];
    const tokenRegex = /(\*\*|\*)/g;
    let currentBold = false;
    let currentItalic = false;
    
    let lastIndex = 0;
    let match;
    
    while ((match = tokenRegex.exec(text)) !== null) {
        const token = match[0];
        const index = match.index;
        
        if (index > lastIndex) {
            spans.push({
                text: text.substring(lastIndex, index),
                bold: currentBold,
                italic: currentItalic
            });
        }
        
        if (token === '**') {
            currentBold = !currentBold;
        } else if (token === '*') {
            currentItalic = !currentItalic;
        }
        
        lastIndex = tokenRegex.lastIndex;
    }
    
    if (lastIndex < text.length) {
        spans.push({
            text: text.substring(lastIndex),
            bold: currentBold,
            italic: currentItalic
        });
    }
    
    if (spans.length === 0 && text.length > 0) {
        spans.push({ text, bold: false, italic: false });
    }
    
    return spans.filter(s => s.text !== '');
}

function renderSpans(doc, spans, options = {}) {
    spans.forEach((span, idx) => {
        let font = 'Helvetica';
        if (span.bold && span.italic) {
            font = 'Helvetica-BoldOblique';
        } else if (span.bold) {
            font = 'Helvetica-Bold';
        } else if (span.italic) {
            font = 'Helvetica-Oblique';
        }
        
        doc.font(font);
        
        const isLast = idx === spans.length - 1;
        const textOptions = {
            continued: !isLast,
            ...options
        };
        doc.text(span.text, textOptions);
    });
}

function renderHeading(doc, text, size, color, gapBefore) {
    // Check for size + gapBefore + 70 to prevent orphan headings at bottom of page
    checkPageSpace(doc, size + gapBefore + 70);
    doc.moveDown(gapBefore / 10);
    const cleanText = text.replace(/\*\*/g, '');
    doc.fontSize(size).fillColor(color).font('Helvetica-Bold');
    doc.text(cleanText);
    doc.moveDown(0.3);
}

function renderHorizontalRule(doc) {
    checkPageSpace(doc, 20);
    doc.moveDown(0.5);
    doc.strokeColor('#e2e8f0')
       .lineWidth(1)
       .moveTo(50, doc.y)
       .lineTo(562, doc.y)
       .stroke();
    doc.moveDown(0.5);
}

function renderBlockquote(doc, text) {
    const padding = 10;
    const width = 512;
    
    doc.font('Helvetica').fontSize(10);
    const spans = parseInlineStyles(text);
    const plainText = spans.map(s => s.text).join('');
    const textHeight = doc.heightOfString(plainText, { width: width - (padding * 2) - 10 });
    const blockHeight = textHeight + (padding * 2);
    
    checkPageSpace(doc, blockHeight + 10);
    
    const startX = 50;
    const startY = doc.y;
    
    doc.fillColor('#f7fafc')
       .rect(startX, startY, width, blockHeight)
       .fill();
       
    doc.strokeColor('#2b6cb0')
       .lineWidth(4)
       .moveTo(startX, startY)
       .lineTo(startX, startY + blockHeight)
       .stroke();
       
    doc.x = startX + padding + 4;
    doc.y = startY + padding;
    
    const italicSpans = spans.map(s => ({ ...s, italic: true }));
    renderSpans(doc, italicSpans, { width: width - (padding * 2) - 10 });
    
    doc.x = 50;
    doc.y = startY + blockHeight;
    doc.moveDown(0.8);
}

function renderListItem(doc, marker, content, indentLevel) {
    const leftMargin = 50;
    const indent = 15 + (indentLevel * 10);
    const contentWidth = 512 - indent;
    
    doc.font('Helvetica').fontSize(10);
    const textHeight = doc.heightOfString(content, { width: contentWidth });
    checkPageSpace(doc, textHeight + 5);
    
    const startY = doc.y;
    
    let cleanMarker = marker;
    if (marker === '-' || marker === '*') {
        cleanMarker = '•';
    }
    
    doc.font('Helvetica-Bold').fillColor('#2d3748');
    doc.text(cleanMarker, leftMargin + indent - 15, startY);
    
    doc.x = leftMargin + indent;
    doc.y = startY;
    
    const spans = parseInlineStyles(content);
    renderSpans(doc, spans, { width: contentWidth });
    
    doc.x = leftMargin;
    doc.moveDown(0.3);
}

function renderParagraph(doc, text) {
    const spans = parseInlineStyles(text);
    const plainText = spans.map(s => s.text).join('');
    
    doc.font('Helvetica').fontSize(10);
    const textHeight = doc.heightOfString(plainText, { width: 512 });
    checkPageSpace(doc, textHeight + 10);
    
    doc.fillColor('#2d3748');
    renderSpans(doc, spans, { width: 512 });
    doc.moveDown(0.5);
}

function renderTable(doc, tableLines) {
    const rows = [];
    tableLines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.includes('---') && !trimmed.startsWith('|')) return;
        if (trimmed.startsWith('|') && trimmed.includes('---')) return;
        
        const cells = trimmed.split('|')
            .map(c => c.trim())
            .filter((c, index, arr) => index > 0 && index < arr.length - 1);
            
        if (cells.length > 0) {
            rows.push(cells);
        }
    });
    
    if (rows.length === 0) return;
    
    const numCols = rows[0].length;
    const startX = 50;
    const totalWidth = 512;
    
    const colWidths = [];
    if (numCols === 2) {
        colWidths.push(150, 362);
    } else if (numCols === 3) {
        colWidths.push(110, 240, 162);
    } else {
        const evenWidth = totalWidth / numCols;
        for (let j = 0; j < numCols; j++) {
            colWidths.push(evenWidth);
        }
    }
    
    const cellPadding = 8;
    
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const isHeader = r === 0;
        
        let rowHeight = 0;
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        
        for (let c = 0; c < Math.min(row.length, numCols); c++) {
            const cellText = row[c].replace(/\*\*/g, '');
            const innerWidth = colWidths[c] - (cellPadding * 2);
            const cellHeight = doc.heightOfString(cellText, { width: innerWidth });
            if (cellHeight > rowHeight) {
                rowHeight = cellHeight;
            }
        }
        
        rowHeight += cellPadding * 2;
        
        checkPageSpace(doc, rowHeight + 10);
        
        const currentY = doc.y;
        
        if (isHeader) {
            doc.fillColor('#2c3e50')
               .rect(startX, currentY, totalWidth, rowHeight)
               .fill();
        } else if (r % 2 === 1) {
            doc.fillColor('#f8fafc')
               .rect(startX, currentY, totalWidth, rowHeight)
               .fill();
        }
        
        let currentX = startX;
        for (let c = 0; c < Math.min(row.length, numCols); c++) {
            const cellText = row[c];
            const cellW = colWidths[c];
            
            doc.x = currentX + cellPadding;
            doc.y = currentY + cellPadding;
            
            doc.fontSize(9);
            if (isHeader) {
                doc.fillColor('#ffffff').font('Helvetica-Bold');
                doc.text(cellText, { width: cellW - (cellPadding * 2) });
            } else {
                doc.fillColor('#2d3748');
                const spans = parseInlineStyles(cellText);
                renderSpans(doc, spans, { width: cellW - (cellPadding * 2) });
            }
            
            currentX += cellW;
        }
        
        doc.strokeColor('#e2e8f0')
           .lineWidth(0.5)
           .moveTo(startX, currentY + rowHeight)
           .lineTo(startX + totalWidth, currentY + rowHeight)
           .stroke();
           
        doc.x = startX;
        doc.y = currentY + rowHeight;
    }
    
    doc.moveDown(0.8);
}

function drawMarkdown(doc, markdown) {
    const lines = markdown.split('\n');
    let i = 0;
    while (i < lines.length) {
        let line = lines[i];
        let trimmed = line.trim();
        
        if (trimmed === '') {
            doc.moveDown(0.3);
            i++;
            continue;
        }
        
        if (trimmed.startsWith('>')) {
            let quoteLines = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                quoteLines.push(lines[i].trim().substring(1).trim());
                i++;
            }
            renderBlockquote(doc, quoteLines.join(' '));
            continue;
        }
        
        if (trimmed.startsWith('|')) {
            let tableLines = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i].trim());
                i++;
            }
            renderTable(doc, tableLines);
            continue;
        }
        
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
            renderHorizontalRule(doc);
            i++;
            continue;
        }
        
        if (trimmed.startsWith('# ')) {
            renderHeading(doc, trimmed.substring(2), 20, '#1a365d', 12);
            i++;
            continue;
        }
        if (trimmed.startsWith('## ')) {
            renderHeading(doc, trimmed.substring(3), 16, '#2c5282', 10);
            i++;
            continue;
        }
        if (trimmed.startsWith('### ')) {
            renderHeading(doc, trimmed.substring(4), 12, '#2d3748', 8);
            i++;
            continue;
        }
        
        const bulletMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
        if (bulletMatch) {
            const indentLevel = bulletMatch[1].length;
            const marker = bulletMatch[2];
            const content = bulletMatch[3];
            renderListItem(doc, marker, content, indentLevel);
            i++;
            continue;
        }
        
        renderParagraph(doc, trimmed);
        i++;
    }
}

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

        const cleanedNotes = cleanUnicode(notes);

        const doc =
            new PDFDocument({
                margin: 50,
                bufferPages: true
            });

        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");

        res.setHeader(
            "Content-Type",
            "application/pdf"
        );

        res.setHeader(
            "Content-Disposition",
            "attachment; filename=LectureNotes.pdf"
        );

        doc.pipe(res);

        // Header Title (on page 1)
        doc.fillColor('#1a365d').font('Helvetica-Bold').fontSize(22).text("AI Lecture Notes", { align: 'center' });
        doc.moveDown(0.3);
        doc.strokeColor('#1a365d').lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(1);

        // Draw parsed markdown
        drawMarkdown(doc, cleanedNotes);

        // Draw page numbers and headers/footers on all pages
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            
            // Temporarily set margins to 0 to prevent auto-page break
            const oldBottomMargin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            
            // Draw header
            doc.fontSize(8).fillColor('#718096').font('Helvetica');
            doc.text("AI LECTURE STUDY NOTES", 50, 20, { width: 512, align: 'left' });
            doc.text("GENERATED BY LEARNING AGENT", 50, 20, { width: 512, align: 'right' });
            
            // Thin line
            doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, 32).lineTo(562, 32).stroke();
            
            // Draw footer
            doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, 750).lineTo(562, 750).stroke();
            doc.text(`Page ${i + 1} of ${pages.count}`, 50, 760, { width: 512, align: 'center' });
            
            // Restore margins
            doc.page.margins.bottom = oldBottomMargin;
        }

        doc.end();

    } catch(err) {

        console.error(err);

        res.status(500).json({
            success: false
        });

    }

});

app.post("/cleanup-session", (req, res) => {

    try {

        const framesDir =
            path.join(
                __dirname,
                "uploads",
                "frames"
            );

        if(fs.existsSync(framesDir)) {

            fs.readdirSync(framesDir)
            .forEach(file => {

                fs.unlinkSync(
                    path.join(
                        framesDir,
                        file
                    )
                );

            });

        }

        const audioFile =
            path.join(
                __dirname,
                "audio",
                "lecture.webm"
            );

        if(fs.existsSync(audioFile)) {

            fs.unlinkSync(audioFile);

        }

        // Also clean up any generated notes, chunks and embeddings
        const filesToDelete = [
            path.join(__dirname, "lecture-notes.md"),
            path.join(__dirname, "chunks.json"),
            path.join(__dirname, "embeddings.json"),
            "lecture-notes.md",
            "chunks.json",
            "embeddings.json"
        ];

        filesToDelete.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`Cleaned up file: ${filePath}`);
                } catch (e) {
                    console.error(`Error deleting ${filePath}:`, e.message);
                }
            }
        });

        res.json({
            success: true
        });

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