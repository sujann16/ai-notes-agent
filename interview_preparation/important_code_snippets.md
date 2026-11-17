# Critical Code Implementations & Architectural Snippets

This document catalogs the most vital production code implementations across the **AI Multimodal Notes Generator**. Each section highlights the exact file path, class/function identifier, verbatim source code snippet, architectural purpose, and step-by-step execution flow.

---

## 1. REST API Routing & Streaming Multer Storage

* **File Path**: `backend/routes/api.js`
* **Identifier**: `multer.diskStorage` and Express Router declarations

```javascript
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.body.sessionId || "current";
    const dir = StorageManager.getAudioDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = req.body.chunkIndex || "0";
    cb(null, `chunk_${chunkIndex}.webm`);
  }
});

const audioUpload = multer({ storage });

// Routing endpoints
router.post("/start-session", SessionController.createSession);
router.post("/stop-session", SessionController.stopSession);
router.post("/cleanup-session", SessionController.cleanupSession);
router.post("/save-frame", FrameController.saveFrame);
router.post("/upload-audio-chunk", audioUpload.single("audio"), AudioController.uploadAudioChunk);
router.post("/generate-notes", NotesController.generateNotes);
router.get("/download-pdf", NotesController.downloadPDF);
router.post("/ask", NotesController.ask);
router.post("/generate-quiz", NotesController.generateQuiz);
router.get("/notes", NotesController.notes);
```

### Purpose & Execution Flow:
* **Purpose**: Configures dynamic file routing for streaming audio chunks and establishes clean RESTful API contracts.
* **Execution Flow**: When a multipart POST request hits `/upload-audio-chunk`, Multer intercepts the request before controller invocation. It extracts `req.body.sessionId`, queries `StorageManager.getAudioDir()` to resolve `sessions/<sessionId>/audio/`, creates the directory recursively if it doesn't exist, and names the file `chunk_<chunkIndex>.webm`.

---

## 2. Race-Condition-Free Metadata Serialization Queue

* **File Path**: `backend/utils/StorageManager.js`
* **Identifier**: `StorageManager.updateMetadata` and `writeQueue`

```javascript
let writeQueue = Promise.resolve();

class StorageManager {
  // ...
  static async updateMetadata(sessionId, updaterFn) {
    return new Promise((resolve, reject) => {
      writeQueue = writeQueue.then(async () => {
        try {
          const metadata = this.readMetadata(sessionId);
          await updaterFn(metadata);
          this.writeMetadata(sessionId, metadata);
          resolve(metadata);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  static writeMetadata(sessionId, metadata) {
    const metadataPath = path.join(this.getSessionDir(sessionId), "session_metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
}
```

### Purpose & Execution Flow:
* **Purpose**: Prevents critical race conditions and file corruption when asynchronous background workers (parallel ASR transcription chunks and computer vision slide extractions) attempt to write to `session_metadata.json` concurrently.
* **Execution Flow**: `writeQueue` maintains an ongoing Promise chain. Every time `updateMetadata` is called, it chains `.then()` onto `writeQueue`. Each update executes sequentially: reading the latest metadata from disk, running the mutation `updaterFn(metadata)`, writing back to disk synchronously, and resolving the caller's Promise.

---

## 3. High-Speed Frame Deduplication Algorithm

* **File Path**: `backend/utils/compare_frames.py`
* **Identifier**: `main()` and image difference computation

```python
import sys
import os
from PIL import Image
import numpy as np

def main():
    if len(sys.argv) < 3:
        print("true")
        sys.exit(0)
    
    img_path1 = sys.argv[1]
    img_path2 = sys.argv[2]
    
    if not os.path.exists(img_path1) or not os.path.exists(img_path2):
        print("true")
        sys.exit(0)
        
    try:
        # Resize to 32x32 greyscale for noise-resilient comparison
        img1 = Image.open(img_path1).convert('L').resize((32, 32))
        img2 = Image.open(img_path2).convert('L').resize((32, 32))
        
        arr1 = np.array(img1, dtype=np.float32)
        arr2 = np.array(img2, dtype=np.float32)
        
        mae = np.mean(np.abs(arr1 - arr2)) / 255.0
        
        # Threshold: 0.015 (from original deduplicate_slides.py)
        if mae > 0.015:
            print("true")
        else:
            print("false")
    except Exception as e:
        # Fallback to true (images are different) in case of error
        print("true")

if __name__ == "__main__":
    main()
```

### Purpose & Execution Flow:
* **Purpose**: Filters out duplicate video frames captured during static lecture slides, preventing redundant vision LLM inference calls and saving substantial compute/memory resources.
* **Execution Flow**:
  1. Opens two adjacent frames using Pillow (`PIL`).
  2. Converts images to 8-bit grayscale (`'L'`) and resizes them down to a 32x32 matrix (1,024 pixels total).
  3. Converts both matrices to NumPy float arrays.
  4. Calculates normalized Mean Absolute Error: $\text{MAE} = \frac{1}{1024} \sum |A_{i,j} - B_{i,j}| / 255.0$.
  5. If MAE > 0.015 (1.5% average pixel variation), it prints `"true"` to stdout, indicating a genuine slide transition.

---

## 4. Faster-Whisper Quantized Speech-to-Text Subprocess

* **File Path**: `backend/utils/transcribe.py`
* **Identifier**: `WhisperModel` transcription pipeline

```python
import json
from faster_whisper import WhisperModel
import sys

audio_file = sys.argv[1]

model = WhisperModel(
    "base",
    device="cpu",
    compute_type="int8"
)

segments, info = model.transcribe(audio_file)

result_segments = []
for segment in segments:
    result_segments.append({
        "start": segment.start,
        "end": segment.end,
        "text": segment.text.strip()
    })

print(json.dumps(result_segments))
```

### Purpose & Execution Flow:
* **Purpose**: Converts 15-second WebM audio chunks into timestamped text segments locally without relying on external cloud APIs or requiring GPU hardware.
* **Execution Flow**:
  1. Receives audio chunk path via `sys.argv[1]`.
  2. Instantiates `WhisperModel` loading the `"base"` model weights quantized to 8-bit integers (`int8`) running on CPU using CTranslate2.
  3. Transcribes audio chunk, producing a generator of segment objects containing `start`, `end`, and `text`.
  4. Formats segments into a JSON array and prints to standard output, where `transcribe.js` intercepts and parses it.

---

## 5. Vision-Language Model Structural Extraction (Qwen-VL)

* **File Path**: `backend/services/SlideExtractor.js`
* **Identifier**: `SlideExtractor.extractSlideContent`

```javascript
static async extractSlideContent(sessionId, absolutePath) {
  console.log(`[SlideExtractor] Starting local Qwen-VL OCR for ${path.basename(absolutePath)}...`);
  const imageBase64 = fs.readFileSync(absolutePath).toString("base64");
  
  const response = await ollama.chat({
    model: config.visionModel, // "qwen2.5vl:3b"
    options: {
      num_ctx: 8192,
      temperature: 0
    },
    messages: [
      {
        role: "user",
        content: `Extract all visible content and analyze structural elements from this lecture slide screenshot. Do not explain, summarize, or add external knowledge. You must perform a purely factual visual extraction.

Return a JSON object in the EXACT format specified below, enclosed inside a \`\`\`json and \`\`\` code block:
\`\`\`json
{
  "title": "Slide Title (or null if not visible)",
  "visibleText": "General text that doesn't fit tables, equations, bullet points, or diagrams",
  "bullets": ["Bullet point 1", "Bullet point 2"],
  "equations": ["Equation 1 or mathematical derivation step"],
  "tables": [
    ["Row 1 Col 1", "Row 1 Col 2"],
    ["Row 2 Col 1", "Row 2 Col 2"]
  ],
  "detectedVisuals": {
    "flowchart": true/false,
    "blockDiagram": true/false,
    "architectureDiagram": true/false,
    "uml": true/false,
    "erDiagram": true/false,
    "graph": true/false,
    "table": true/false,
    "mathematicalDerivation": true/false
  },
  "diagrams": [
    {
      "type": "flowchart/block diagram/architecture diagram/UML/ER diagram/graph/other",
      "description": "Factual description of the diagram. List all visible components, labels, nodes, arrow direction connections, highlighted elements, and groupings..."
    }
  ],
  "figures": [ { "description": "..." } ],
  "charts": [ { "type": "...", "description": "..." } ]
}
\`\`\``
      }
    ],
    images: [imageBase64]
  });

  const extraction = response.message.content;
  // Parses JSON output with robust regex fallback...
  return parsedContent;
}
```

### Purpose & Execution Flow:
* **Purpose**: Extracts full textual semantics, equations, tabular data, and structured visual diagram descriptions from a newly detected lecture slide.
* **Execution Flow**: Loads the slide image, encodes it to base64, and prompts Ollama's `qwen2.5vl:3b` with a zero-temperature instruction enforcing an exact JSON extraction schema. Parses the returned JSON string and stores it in session metadata.

---

## 6. Multimodal Temporal Timeline Alignment

* **File Path**: `backend/services/NoteGenerator.js`
* **Identifier**: `NoteGenerator.alignTimeline`

```javascript
static alignTimeline(uniqueSlides, transcriptSegments) {
  const sortedSlides = [...uniqueSlides].sort((a, b) => a.timestamp - b.timestamp);
  const alignment = sortedSlides.map((slide, idx) => {
    const nextSlide = sortedSlides[idx + 1];
    const startTime = slide.timestamp;
    const endTime = nextSlide ? nextSlide.timestamp : Infinity;
    
    return {
      slide: slide.slide,
      timestamp: slide.timestamp,
      startTime,
      endTime,
      slideContent: slide.slideContent,
      transcriptSegments: []
    };
  });
  
  transcriptSegments.forEach(segment => {
    const segmentStart = segment.start;
    let activeSlide = alignment[0];
    for (let i = 0; i < alignment.length; i++) {
      if (segmentStart >= alignment[i].startTime && segmentStart < alignment[i].endTime) {
        activeSlide = alignment[i];
        break;
      }
    }
    if (activeSlide) {
      activeSlide.transcriptSegments.push(segment.text);
    }
  });
  
  return alignment;
}
```

### Purpose & Execution Flow:
* **Purpose**: Synchronizes the asynchronous visual stream (slide transition timestamps) with the spoken audio stream (Whisper transcript segment timestamps).
* **Execution Flow**:
  1. Sorts unique slides chronologically.
  2. Constructs contiguous temporal intervals `[startTime, endTime)` where `endTime` is the transition timestamp of the subsequent slide.
  3. Iterates through all transcript segments, matching each segment's `segment.start` against the slide interval.
  4. Appends matching spoken text to that slide's `transcriptSegments` array, creating a unified multimodal data unit.

---

## 7. Anti-Hallucination Grounded Prompt Construction

* **File Path**: `backend/utils/PromptBuilder.js`
* **Identifier**: `PromptBuilder.buildNotePrompt`

```javascript
class PromptBuilder {
  static buildNotePrompt(alignedTimeline) {
    const formattedSources = alignedTimeline.map((data, index) => {
      // Formats bullets, equations, tables, detected visuals, and diagrams...
      return `
=== Topic/Slide #${index + 1} ===
Relative Timestamp: ${data.timestamp}s
Slide Image File: ${data.slide}
[SLIDE CONTENT]
${slideText}
[LECTURER TRANSCRIPT]
${spokenText}
`;
    }).join("\n\n");

    const systemInstruction = `You are a student taking clear, highly factual notes while attending an academic lecture.
Your task is to write clean, natural, and strictly grounded lecture notes based ONLY on the provided sources (Slide Content and Lecturer Transcript).

Strict Grounding Rules:
- Do NOT use any external knowledge. If a topic is not explicitly mentioned or clearly visible in the slides/transcript, it must NOT appear in the notes.
- Do NOT make AI-generated assumptions or textbook-style expansions.
- Do NOT complete partially visible concepts or add examples/definitions that were not discussed.
- Every statement must be traceable directly to the provided sources.
- Avoid noisy OCR artifacts or unrelated transcript fragments. If uncertain about a detail, omit it entirely instead of guessing.
- Avoid generic filler or AI-like preamble. Write naturally like a student attending the class.
- Merge the slide content and lecturer transcript into a unified chronological explanation of each topic.
- Integrate explanations of visual diagrams and flowcharts directly into the topic explanations. Explain arrow flows and component relationships factually based ONLY on the provided diagram descriptions and what the lecturer spoke.
- Whenever a slide contains a diagram, you MUST include the exact tag \`[DIAGRAM: <filename>]\` (where <filename> is the exact value of the Slide Image File field, e.g. \`frame_1719323891000.jpg\`) on a new line immediately below the topic sub-heading \`### Topic: [Topic Name]\` in the Detailed Explanation section. Do not output a diagram tag if no diagram is present on the slide.`;

    const prompt = `Lecture Data:
${formattedSources}

Synthesize the lecture data and generate notes in the following Markdown format. Do NOT add any extra sections, glossary, reference list, review questions, or key takeaways. Include ONLY these sections:

# [Lecture Title]

## Topics Covered

[A bullet list of all main topics discussed during the lecture.]

---

## Detailed Explanation

### Topic: [Topic Name]
[DIAGRAM: Slide Image File] (Include this line ONLY if a diagram is detected on this slide, replacing with the exact file name. Otherwise, omit it.)

[Your detailed, grounded explanation here.]

---

## Definitions
[Include ONLY definitions that were explicitly explained in the transcript or clearly visible in the slides.]`;

    return { systemInstruction, prompt };
  }
}
```

### Purpose & Execution Flow:
* **Purpose**: Eliminates LLM hallucinations and enforces strict adherence to lecture content while prompting the model to embed `[DIAGRAM: <filename>]` markers needed by the PDF generator.
* **Execution Flow**: Serializes the multimodal timeline into topic blocks, attaches strict negative constraints in the system instruction, and passes the compiled prompt to the active AI provider.

---

## 8. Vector Embedding Generation & Semantic RAG Search

* **File Path**: `backend/services/NoteGenerator.js` and `backend/controllers/NotesController.js`
* **Identifier**: `NoteGenerator.chunkAndEmbed` and `NotesController.ask`

### 8.1 Chunking & Embedding Generation (`NoteGenerator.js`):
```javascript
static async chunkAndEmbed(sessionId, notes) {
  const sessionDir = StorageManager.getSessionDir(sessionId);
  
  const chunks = notes
    .split("\n\n")
    .filter(chunk => chunk.trim().length > 30)
    .map((text, index) => ({ id: index + 1, text }));

  fs.writeFileSync(path.join(sessionDir, "chunks.json"), JSON.stringify(chunks, null, 2));

  const embeddings = [];
  for (const chunk of chunks) {
    try {
      const response = await ollama.embed({
        model: config.embeddingModel, // "nomic-embed-text"
        input: chunk.text
      });
      embeddings.push({
        id: chunk.id,
        text: chunk.text,
        embedding: response.embeddings[0]
      });
    } catch (err) {
      console.error(`[NoteGenerator] Failed to embed chunk ${chunk.id}:`, err);
    }
  }

  fs.writeFileSync(path.join(sessionDir, "embeddings.json"), JSON.stringify(embeddings, null, 2));
}
```

### 8.2 Retrieval & Cosine Similarity (`NotesController.js`):
```javascript
function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// Inside NotesController.ask:
const response = await ollama.embed({
  model: embeddingModel,
  input: question
});
const queryVector = response.embeddings[0];

const scored = embeddings.map(chunk => ({
  ...chunk,
  score: cosineSimilarity(queryVector, chunk.embedding)
}));

scored.sort((a, b) => b.score - a.score);
const topChunks = scored.slice(0, 3);
const context = topChunks.map(c => c.text).join("\n\n");

const provider = getAIProvider();
const answer = await provider.askQuestion(question, context);
```

### Purpose & Execution Flow:
* **Purpose**: Implements a self-contained Retrieval-Augmented Generation pipeline. Notes are chunked and transformed into 768-dimensional dense vectors using Ollama's `nomic-embed-text`. Incoming user queries are embedded on the fly and matched via mathematical cosine similarity to retrieve the top 3 relevant passages as context for the LLM.

---

## 9. Two-Column PDF Layout with Diagram Injection

* **File Path**: `backend/services/PdfGenerator.js`
* **Identifier**: `PdfGenerator.drawMarkdown`

```javascript
static drawMarkdown(sessionId, doc, markdown) {
  const blocks = markdown.split(/(?=### Topic:)/);
  
  blocks.forEach(block => {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) return;
    
    const diagramMatch = trimmedBlock.match(/\[DIAGRAM:\s*([^\]]+)\]/);
    
    if (diagramMatch) {
      const diagramFilename = diagramMatch[1].trim();
      const cleanedBlock = trimmedBlock.replace(/\[DIAGRAM:\s*[^\]]+\]\r?\n?/, "");
      
      const lines = cleanedBlock.split('\n');
      let headingLine = lines[0].startsWith('### Topic:') ? lines[0] : "";
      let restLines = headingLine ? lines.slice(1) : lines;
      
      doc.printWidth = 512;
      doc.leftMargin = 50;
      doc.x = 50;
      if (headingLine) {
        this.renderHeading(doc, headingLine.substring(4), 12, '#2d3748', 8);
      }
      
      if (doc.y + 125 > 742) doc.addPage();
      
      const startPageRange = doc.bufferedPageRange();
      const startPageIndex = startPageRange.count - 1;
      const contentStartY = doc.y;
      
      // Render text on Left Column (Width: 280pt)
      doc.printWidth = 280;
      doc.leftMargin = 50;
      doc.x = 50;
      this.drawLines(doc, restLines);
      
      const endPageRange = doc.bufferedPageRange();
      const endPageIndex = endPageRange.count - 1;
      const contentEndY = doc.y;
      
      // Embed Diagram Image on Right Column (x: 350pt, Width: 212pt)
      const imagePath = path.join(StorageManager.getFramesDir(sessionId), diagramFilename);
      if (fs.existsSync(imagePath)) {
        doc.switchToPage(startPageIndex);
        doc.image(imagePath, 350, contentStartY, { width: 212 });
        doc.switchToPage(endPageIndex);
      }
      
      doc.printWidth = 512;
      doc.leftMargin = 50;
      doc.x = 50;
      doc.y = (startPageIndex === endPageIndex) ? Math.max(contentEndY, contentStartY + 119.25) : contentEndY;
      doc.moveDown(0.8);
    } else {
      // Full-width layout (512pt) for topics without diagrams
      doc.printWidth = 512;
      doc.leftMargin = 50;
      doc.x = 50;
      this.drawLines(doc, trimmedBlock.split('\n'));
    }
  });
}
```

### Purpose & Execution Flow:
* **Purpose**: Transforms raw Markdown text into a professional academic PDF document. Automatically detects `[DIAGRAM: <filename>]` tags and renders a sophisticated split-column layout with explanatory text on the left and the actual slide screenshot on the right.
