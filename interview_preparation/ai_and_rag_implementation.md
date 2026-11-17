# AI, Multimodal Processing & RAG Implementation Audit

This document provides a deep technical analysis of all Artificial Intelligence, Machine Learning, Computer Vision, Speech Processing, and Retrieval-Augmented Generation (RAG) components implemented in the project.

---

## 1. Multimodal Architecture & Component Matrix

| Modality / AI Component | Implemented Technology | Underlying Algorithm / Model | Execution Host | Source Files |
| :--- | :--- | :--- | :--- | :--- |
| **Audio Capture** | WebRTC / MediaRecorder | 15s chunked WebM encoding | Browser Offscreen | `offscreen.js` |
| **Audio Transcription (ASR)** | `faster-whisper` | Whisper `"base"`, `int8` CPU quantization | Python Subprocess | `utils/transcribe.py`, `utils/transcribe.js` |
| **Video Frame Capture** | Chrome Tab Capture API | JPEG snapshots (80% quality) | Chrome Extension | `SessionManager.js` (client) |
| **Frame Deduplication** | Pillow + NumPy | Normalized Grayscale 32x32 MAE | Python Subprocess | `utils/compare_frames.py` |
| **Slide OCR & Visual Extraction**| Ollama Vision | `qwen2.5vl:3b` (Zero-temp JSON prompt) | Local Ollama Daemon | `services/SlideExtractor.js` |
| **Multimodal Alignment** | Discrete Time Windowing | Relative Timestamp Binning | Node.js Backend | `services/NoteGenerator.js` |
| **Pedagogical Note Synthesis**| Google Gemini / Ollama | `gemini-2.5-flash` / `qwen3:4b` | Cloud API / Local Ollama | `providers/GeminiProvider.js`, `PromptBuilder.js` |
| **Document Compilation** | Custom PDFKit AST | Two-column coordinate rendering | Node.js Backend | `services/PdfGenerator.js` |
| **Text Chunking** | Double-newline Splitter | Paragraph filter (`length > 30`) | Node.js Backend | `services/NoteGenerator.js` |
| **Vector Embedding Generation** | Ollama Embeddings | `nomic-embed-text` (768 dimensions) | Local Ollama Daemon | `services/NoteGenerator.js` |
| **Vector Retrieval (RAG)** | In-Memory Cosine Similarity | Top-3 dot product / vector norms | Node.js Backend | `controllers/NotesController.js` |
| **Interactive Q&A & Quiz** | Grounded LLM Prompting | Context-injected LLM generation | Gemini / Ollama | `controllers/NotesController.js` |

---

## 2. In-Depth Component Analysis

### 2.1 Audio Recording & Transcription
* **Capture Layer (`offscreen.js`)**: Captures tab audio using `navigator.mediaDevices.getUserMedia`. Uses Web Audio API's `AudioContext` to route the incoming stream back to `destination` (speakers), preventing user audio muting. Slices audio into independent 15-second WebM chunks.
* **ASR Engine (`utils/transcribe.py`)**: Spawns `faster-whisper` using CTranslate2.
  * Model: `base` (~74M parameters).
  * Compute Type: `int8` integer quantization on CPU.
  * Execution Time: Transcribes 15 seconds of audio in under 1 second on modern CPUs.
  * Output: Segment-level timestamps (`start`, `end`, `text`).
* **Timestamp Normalization (`services/SpeechTranscriber.js`)**: Converts chunk-relative timestamps into global session timestamps using `timestampOffset = chunkIndex * 15`.

---

### 2.2 Video Frame Capture & Intelligent Deduplication
* **Capture Layer (`SessionManager.js`)**: Invokes `chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 })` at user-selected intervals (1s to 60s, default 5s).
* **Frame Deduplication Algorithm (`utils/compare_frames.py`)**:
  * Instead of sending every frame to an expensive vision LLM, frames are compared to the preceding slide.
  * Converts images to 32x32 grayscale:
    $$\text{Image} \rightarrow \text{Grayscale} \rightarrow 32 \times 32 \text{ Matrix}$$
  * Computes normalized Mean Absolute Error (MAE):
    $$\text{MAE} = \frac{1}{1024} \sum_{i=1}^{32} \sum_{j=1}^{32} \frac{|A_{i,j} - B_{i,j}|}{255.0}$$
  * If $\text{MAE} \le 0.015$, the frame is discarded as an identical duplicate.
  * **Slide Memory Cache (`services/SlideExtractor.js`)**: If a slide changes, the system compares it against the last 4 unique slides. If the lecturer flipped back to a previous slide, the cached OCR extraction is reused immediately, skipping vision model inference entirely.

---

### 2.3 Image Processing, Structural OCR & Diagram Analysis
* **Classical OCR vs. Vision-Language Model**: The project avoids classical OCR engines (e.g., Tesseract) in favor of a modern **Vision-Language Model (VLM)**: `qwen2.5vl:3b`.
* **Zero-Temperature Schema Enforcement (`services/SlideExtractor.js`)**:
  * Temperature: `0` (Deterministic, factual extraction).
  * Context Window: `8192` tokens.
  * Instructs the model to extract:
    1. Slide title.
    2. Bullet points and general text.
    3. Mathematical equations (e.g., LaTeX / symbolic formulations).
    4. Tabular data (matrix of rows and columns).
    5. Structural classification of visual diagrams (flowcharts, architecture diagrams, block diagrams, UML, ER diagrams, graphs, charts).
    6. Factual descriptions of diagram nodes, labels, and arrow directions.

---

### 2.4 Multimodal Temporal Synchronization
* **The Alignment Challenge**: Visual slide transitions and audio speech segments occur asynchronously. Slides change at irregular intervals, while speech flows continuously.
* **Discrete Windowing Algorithm (`NoteGenerator.alignTimeline`)**:
  1. Slides are ordered chronologically: $[S_1(t_1), S_2(t_2), \dots, S_n(t_n)]$.
  2. Contiguous non-overlapping time boundaries are assigned:
     $$\text{Window}_i = [t_i, t_{i+1})$$
     (with $t_{n+1} = \infty$).
  3. Every transcript segment $T_k$ with start time $s_k$ is placed into $\text{Window}_i$ if:
     $$t_i \le s_k < t_{i+1}$$
  4. Yields a synchronized multimodal data structure combining visual facts with lecturer explanations.

---

### 2.5 Prompt Engineering & Anti-Hallucination Grounding
* **Prompt Construction (`utils/PromptBuilder.js`)**:
  * Role: Student attending a lecture.
  * Strict Grounding Directives:
    * "Do NOT use any external knowledge."
    * "If a topic is not explicitly mentioned or clearly visible in the slides/transcript, it must NOT appear in the notes."
    * "Every statement must be traceable directly to the provided sources."
    * "Avoid generic filler or AI-like preamble."
  * Visual Injection Directive:
    * "Whenever a slide contains a diagram, you MUST include the exact tag `[DIAGRAM: <filename>]` on a new line immediately below the topic sub-heading."

---

### 2.6 Publication-Quality PDF Document Generation
* **PDF Engine (`services/PdfGenerator.js`)**: Built entirely with `pdfkit` (no external HTML-to-PDF headless browsers required).
* **Two-Column Coordinate Layout**:
  * Detects `[DIAGRAM: <filename>]` tag.
  * Text Block: Width 280pt at $x=50$.
  * Diagram Block: Width 212pt at $x=350$ (embedding the high-resolution slide screenshot).
  * Auto-wraps headers, footers, page numbers (`Page X of Y`), blockquotes, and alternating table rows.

---

### 2.7 Retrieval-Augmented Generation (RAG) Architecture

#### Phase 1: Chunking Strategy (`NoteGenerator.chunkAndEmbed`)
* Notes are split by paragraph boundaries (`\n\n`).
* Chunks with length $\le 30$ characters are filtered out to remove whitespace and solitary headers.
* Serialized into `sessions/<sessionId>/chunks.json`.

#### Phase 2: Dense Vector Embedding
* Model: `nomic-embed-text` running via Ollama.
* Vector Dimensionality: 768 dimensions.
* Serialized into `sessions/<sessionId>/embeddings.json`.

#### Phase 3: In-Memory Cosine Similarity Retrieval (`NotesController.ask`)
* When user asks a question $Q$:
  1. Query is embedded via `nomic-embed-text` $\rightarrow \vec{q} \in \mathbb{R}^{768}$.
  2. In-memory cosine similarity is computed across all chunk vectors $\vec{c}_i$:
     $$\text{CosineSimilarity}(\vec{q}, \vec{c}_i) = \frac{\vec{q} \cdot \vec{c}_i}{\|\vec{q}\|_2 \|\vec{c}_i\|_2} = \frac{\sum_{j=1}^{768} q_j c_{i,j}}{\sqrt{\sum_{j=1}^{768} q_j^2} \sqrt{\sum_{j=1}^{768} c_{i,j}^2}}$$
  3. Chunks are sorted descending by score.
  4. Top 3 highest-scoring chunks are concatenated into a factual context string.

#### Phase 4: Context-Injected Generation
* Context string is passed to `provider.askQuestion(question, context)` with strict system instruction:
  *"Answer the question ONLY using the provided context. If the answer cannot be found in the context, respond stating that the information is not present."*

---

## 3. Implemented vs. Non-Implemented AI Features

| Feature | Implementation Status | Evidence / Notes |
| :--- | :--- | :--- |
| **Local Whisper ASR** | **Fully Implemented** | `backend/utils/transcribe.py` |
| **VLM Slide OCR & Visuals** | **Fully Implemented** | `backend/services/SlideExtractor.js` (`qwen2.5vl:3b`) |
| **Frame Deduplication** | **Fully Implemented** | `backend/utils/compare_frames.py` (MAE 0.015) |
| **Multimodal Timeline Alignment** | **Fully Implemented** | `backend/services/NoteGenerator.js` |
| **Grounded LLM Note Generation**| **Fully Implemented** | `GeminiProvider.js` & `OllamaProvider.js` |
| **Custom Two-Column PDF** | **Fully Implemented** | `backend/services/PdfGenerator.js` |
| **Vector RAG Q&A Pipeline** | **Fully Implemented** | `embeddings.json`, `nomic-embed-text`, cosine similarity |
| **Multiple-Choice Quiz Engine** | **Fully Implemented** | `NotesController.generateQuiz` |
| **External Vector Database** | **Not Implemented** | Uses local file-based JSON vectors (`embeddings.json`), not Milvus/Pinecone/Chroma. |
| **Tesseract / Classical OCR** | **Not Implemented** | Handled by VLM (`qwen2.5vl:3b`). |
| **OpenAI / Claude / Grok Providers**| **Stubbed Only** | Interface files exist in `backend/providers/`, but throw errors if invoked. |
| **PDF Document Ingestion** | **Not Implemented** | System generates PDFs; it does not ingest external user PDF documents as input. |
