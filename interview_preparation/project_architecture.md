# Project Architecture & Structural Audit

## 1. Executive Summary & Architectural Overview

The **AI Multimodal Notes Generator** (branded in codebase as *AI Learning Agent*) is an end-to-end intelligent lecture analysis system. It captures live lecture tabs (audio and video streams) via a **Google Chrome Extension (Manifest V3)**, streams the media to a local **Node.js / Express** backend, processes frames and audio asynchronously using local and cloud AI pipelines (Computer Vision, Automatic Speech Recognition, and Large Language Models), aligns multimodal timelines, synthesizes pedagogical study notes with embedded diagrams, compiles publication-ready PDF documents, and indexes the content for local semantic search (Retrieval-Augmented Generation / RAG) and interactive quiz generation.

### Key Architectural Paradigms:
1. **Decoupled Client-Server Architecture**: The frontend client operates in browser sandbox space with minimal compute overhead; heavy-duty media decoding, image difference algorithms, ASR transcription, vector embeddings, and LLM inference reside entirely on the backend server.
2. **Multimodal Temporal Synchronization**: Visual slide frames and audio transcript segments are captured on separate asynchronous tracks and unified through a discrete mathematical alignment window based on relative session timestamps.
3. **Hybrid Edge-Cloud AI Execution**: High-volume, privacy-sensitive, and latency-tolerant tasks (slide frame deduplication, Whisper speech-to-text, vision-based OCR/structure parsing, and vector embeddings) execute locally (via Python sub-processes and local Ollama instances), while final comprehensive pedagogical synthesis can toggle between Cloud LLMs (Google Gemini 2.5 Flash) and local LLMs (Qwen 3 / Qwen 2.5-VL).
4. **Resilient Asynchronous Persistence**: Sequential metadata writing utilizes a Promise-chained serialized write queue (`writeQueue`) preventing file race conditions, while session directories isolate all raw frames, audio chunks, metadata, and generated artifacts per session.

---

## 2. Complete Folder & File Structure

```text
ai-learning-agent/
│
├── manifest.json                     # Chrome Extension Manifest V3 configuration & permissions
├── popup.html                        # Browser action extension popup UI markup
├── popup.css                         # Extension UI stylesheet
├── popup.js                          # Extension UI event listeners and DOM binding controller
├── PopupStateManager.js              # State synchronizer managing UI disabled/enabled states & timer
├── StorageManager.js                 # Chrome extension storage wrapper (chrome.storage.local)
├── SessionManager.js                 # Client-side session coordinator (tabCapture, offscreen lifecycle)
├── offscreen.html                    # Chrome Offscreen document host page (WebRTC audio recording)
├── offscreen.js                      # Offscreen worker handling MediaStream, AudioContext loopback & WebM chunks
├── background.js                     # Manifest V3 service worker managing background events & routing
├── package.json                      # Root npm package metadata (client-side/shared dependencies)
├── package-lock.json                 # Lockfile for root dependencies
├── .gitignore                        # Git exclusion rules (node_modules, logs, env files)
│
├── backend/                          # Node.js Express backend server and AI service modules
│   ├── server.js                     # Express application bootstrap & HTTP port listener (port 3000)
│   ├── package.json                  # Backend dependencies, scripts, and module definitions
│   ├── package-lock.json             # Locked dependency tree for backend
│   ├── config.json                   # System AI model defaults, Ollama endpoints, debug flags
│   ├── .env                          # Environment secrets (AI_PROVIDER, GEMINI_API_KEY, OLLAMA_HOST)
│   ├── .env.example                  # Environment configuration template
│   ├── ask.js                        # Standalone CLI utility for testing local RAG Q&A
│   ├── vision-test.js                # Standalone test script verifying Ollama Qwen-VL model inference
│   ├── test_visual_notes.js          # Full integration test harness verifying visual note generation & PDF
│   ├── deduplicate_slides.py         # Standalone batch frame deduplication script
│   ├── test.png                      # Reference image used for standalone vision and PDF tests
│   │
│   ├── routes/
│   │   └── api.js                    # REST API route declarations and Multer storage configuration
│   │
│   ├── controllers/
│   │   ├── SessionController.js      # Handles /start-session, /stop-session, and /cleanup-session
│   │   ├── FrameController.js        # Handles /save-frame incoming video screenshots
│   │   ├── AudioController.js        # Handles /upload-audio-chunk multipart audio uploads
│   │   └── NotesController.js        # Handles /generate-notes, /download-pdf, /notes, /ask, /generate-quiz
│   │
│   ├── services/
│   │   ├── SessionManager.js         # Backend session lifecycle orchestrator & disk coordinator
│   │   ├── SlideExtractor.js         # Frame comparison trigger, Qwen-VL OCR & structural visual extraction
│   │   ├── SpeechTranscriber.js      # Audio chunk dispatcher to faster-whisper sub-process
│   │   ├── NoteGenerator.js          # Temporal alignment engine, prompt dispatcher, RAG chunking & embedding
│   │   └── PdfGenerator.js           # PDFKit rendering engine with custom Markdown AST & 2-column layout
│   │
│   ├── utils/
│   │   ├── StorageManager.js         # File system path resolver, metadata serializer & WebM concatenator
│   │   ├── PromptBuilder.js          # Structured prompt engineering with anti-hallucination grounding rules
│   │   ├── config.js                 # Unified runtime configuration loader (.env + config.json merge)
│   │   ├── compare_frames.py         # High-speed PIL/NumPy MAE image comparison script
│   │   ├── transcribe.py             # faster-whisper Python worker script (base, int8, CPU)
│   │   └── transcribe.js             # Child-process bridge executing transcribe.py from Node.js
│   │
│   ├── providers/
│   │   ├── AIProvider.js             # Base abstract interface defining provider contracts
│   │   ├── index.js                  # Factory function (getAIProvider) resolving active LLM provider
│   │   ├── GeminiProvider.js         # Google Gemini 2.5 Flash cloud implementation
│   │   ├── OllamaProvider.js         # Local Ollama Qwen 3/4B instruction model implementation
│   │   ├── OpenAIProvider.js         # Stubbed provider interface (throws "not yet implemented")
│   │   ├── ClaudeProvider.js         # Stubbed provider interface (throws "not yet implemented")
│   │   └── GrokProvider.js           # Stubbed provider interface (throws "not yet implemented")
│   │
│   ├── audio/                        # Sample lecture audio test storage (e.g., lecture.webm)
│   ├── rag/                          # Default/fallback vector storage directory (chunks.json, embeddings.json)
│   ├── uploads/                      # Temporary upload directory fallback
│   └── sessions/                     # Isolated session storage directories
│       ├── current/                  # Legacy/default working session folder
│       └── session_<timestamp>_<id>/ # Multi-session isolated workspaces
│           ├── frames/               # Raw captured JPEG frames (frame_<timestamp>.jpg)
│           ├── audio/                # Raw WebM audio chunks (chunk_<index>.webm)
│           ├── lecture.webm          # Concatenated complete audio file
│           ├── session_metadata.json # Chronological unique slides & transcript segments
│           ├── transcript.json       # Exported full transcript segment array
│           ├── transcript.txt        # Timestamped human-readable transcript text
│           ├── lecture-notes.md      # Synthesized Markdown notes
│           ├── LectureNotes.pdf      # Formatted publication-ready PDF notes
│           ├── chunks.json           # RAG text chunks
│           ├── embeddings.json       # Nomic-embed-text vector embeddings
│           ├── debug_aligned_timeline.json # Debug output: merged multimodal timeline
│           ├── debug_final_prompt.txt      # Debug output: full assembled LLM prompt
│           ├── debug_llm_response.txt      # Debug output: raw text returned by LLM
│           └── debug_vision_<frame>.json   # Debug output: raw Qwen-VL response and telemetry
```

---

## 3. Component Responsibilities & Module Categorization

### 3.1 Frontend (Chrome Extension Manifest V3)
* **`manifest.json`**: Declares Manifest V3 conformance, permissions (`activeTab`, `scripting`, `tabs`, `tabCapture`, `storage`, `offscreen`), host permissions (`<all_urls>`), background service worker (`background.js`), and browser action popup (`popup.html`).
* **`popup.html` & `popup.css`**: Defines user interface controls: capture interval dropdown (1s, 3s, 5s, 10s, 15s, 30s, 60s), Start/Stop session buttons, Note Generation trigger, Markdown and PDF download triggers, session cleanup action, and status display.
* **`popup.js`**: Client-side UI controller. Listens for user interactions, delegates actions to `background.js` via `chrome.runtime.sendMessage`, performs direct HTTP fetch requests for note generation and session cleanup, and triggers browser tab downloads for artifacts.
* **`PopupStateManager.js`**: Pure UI state machine. Inspects `chrome.storage.local` keys (`recording`, `startTime`, `captureInterval`, `notesGenerated`, `sessionCompleted`) to dynamically enable/disable buttons and maintains a live session timer ticker.
* **`StorageManager.js` (Root)**: Promise-based wrapper around asynchronous Chrome Storage API (`chrome.storage.local.get`, `.set`, `.remove`, `.clear`).
* **`SessionManager.js` (Root)**: Core client coordinator. Orchestrates `chrome.offscreen` lifecycle, calls backend `POST /start-session`, acquires media stream IDs via `chrome.tabCapture.getMediaStreamId`, initiates periodic visual frame captures via `chrome.tabs.captureVisibleTab`, and dispatches stream IDs to the offscreen audio recorder.
* **`offscreen.html` & `offscreen.js`**: Dedicated offscreen context required by Chrome Manifest V3 to record audio. Captures tab audio streams via `navigator.mediaDevices.getUserMedia`, creates an `AudioContext` loopback routing tab audio to user speakers (preventing tab muting), slices audio into 15-second WebM chunks using `MediaRecorder`, uploads chunks via multipart `FormData` to `POST /upload-audio-chunk`, and handles final chunk flushing on stop.
* **`background.js`**: Event-driven background service worker. Handles incoming messages (`startSession`, `stopSession`, `audioUploadComplete`, `getSessionStatus`), manages session resumption across browser restarts, and closes offscreen documents once final audio uploads complete.

### 3.2 Backend API & Controllers
* **`server.js`**: Express application entry point. Configures JSON body parser with a generous 20MB payload limit (allowing base64 frame ingestion), sets up Cross-Origin Resource Sharing (`cors()`), mounts routes from `routes/api.js`, and binds port 3000.
* **`routes/api.js`**: Declares REST endpoints, initializes Multer with disk storage destination dynamic resolver (`StorageManager.getAudioDir(sessionId)`) and file naming conventions (`chunk_<chunkIndex>.webm`).
* **`controllers/SessionController.js`**: Generates unique cryptographic session IDs (`session_<timestamp>_<random>`), orchestrates creation, stopping, and cleanup of session directories.
* **`controllers/FrameController.js`**: Validates base64 image payloads and delegates frame persistence to `SessionManager.saveFrame`.
* **`controllers/AudioController.js`**: Validates audio chunk uploads, extracts chunk indices and timestamp offsets, and delegates to `SessionManager.registerAndTranscribeChunk`.
* **`controllers/NotesController.js`**: Endpoints for synchronous note generation (`/generate-notes`), file streaming for PDF (`/download-pdf`) and Markdown (`/notes`), vector-based semantic search (`/ask`), and multiple-choice quiz generation (`/generate-quiz`).

### 3.3 Core Processing Services
* **`services/SessionManager.js`**: Central backend coordinator. Manages session metadata state transitions (`Active` -> `Completed`), persists raw frame files to disk, schedules background frame comparison and Whisper transcription tasks, concatenates final audio tracks, and purges session workspaces on cleanup.
* **`services/SlideExtractor.js`**: Multimodal computer vision service. Spawns `compare_frames.py` via `child_process.exec` to detect new slides using Mean Absolute Error (MAE) image difference. When a new slide is identified, it executes local visual OCR and diagram structural analysis via Ollama (`qwen2.5vl:3b`) using custom HTTP keep-alive fetch wrappers.
* **`services/SpeechTranscriber.js`**: Dispatches audio WebM chunks to `utils/transcribe.js`, computes global timestamp offsets (`segment.start + timestampOffset`), and appends normalized segments to the session's cumulative metadata.
* **`services/NoteGenerator.js`**: Core pedagogical synthesizer. Resolves pending slide visual extractions, aligns visual slides with spoken transcripts over time (`alignTimeline`), constructs grounded prompts via `PromptBuilder`, invokes the active AI provider, writes markdown notes, calls `PdfGenerator`, and runs semantic chunking and embedding (`chunkAndEmbed`).
* **`services/PdfGenerator.js`**: Custom PDF rendering pipeline built on `pdfkit`. Features custom Unicode sanitization, dynamic page-overflow boundary checks, inline bold/italic parser, structured headings, blockquotes, markdown tables with auto-scaled columns, and an advanced two-column layout rendering text on the left (280pt) and the extracted visual diagram image on the right (212pt) with running page headers and footers.

### 3.4 Support Utilities & Sub-processes
* **`utils/StorageManager.js`**: File path resolver and filesystem manager. Implements a critical sequential Promise queue (`writeQueue`) to eliminate file corruption and concurrency hazards during parallel metadata updates. Implements `finalizeAudio` to sequentially concatenate WebM chunks into a unified `lecture.webm`.
* **`utils/PromptBuilder.js`**: Constructs strict, anti-hallucination system instructions and user prompts. Mandates zero external knowledge, enforces strict grounding in slides and transcripts, and injects `[DIAGRAM: <filename>]` directives for detected diagrams.
* **`utils/config.js`**: Configuration loader that merges backend `.env` variables with `config.json` fallbacks.
* **`utils/compare_frames.py`**: Python script using Pillow (`PIL`) and `numpy`. Converts incoming frames to 32x32 grayscale arrays and calculates normalized Mean Absolute Error (MAE). Outputs `"true"` if MAE exceeds threshold `0.015`, flagging a slide transition.
* **`backend/deduplicate_slides.py`**: Standalone batch utility for offline deduplication of an entire frames folder.
* **`utils/transcribe.py`**: High-performance local transcription worker using `faster-whisper`. Loads the `"base"` Whisper model quantized to `compute_type="int8"` on CPU, returning timestamped segment arrays in JSON format.
* **`utils/transcribe.js`**: Node.js child-process execution wrapper around `transcribe.py`.

### 3.5 AI Provider Abstraction Layer
* **`providers/AIProvider.js`**: Abstract base class declaring required contract methods: `generateNotes(alignedTimeline)`, `askQuestion(question, context)`, and `generateQuiz(notes)`.
* **`providers/index.js`**: Factory function returning an instantiated provider based on `config.aiProvider`. Defaults to `GeminiProvider`, with fallback to `OllamaProvider`.
* **`providers/GeminiProvider.js`**: Cloud LLM integration using `@google/generative-ai` SDK (`gemini-2.5-flash`), supporting system instructions, grounded synthesis, RAG Q&A, and structured quiz generation.
* **`providers/OllamaProvider.js`**: Local LLM integration using official `ollama` SDK (`qwen3:4b` instruction model), enabling fully offline note generation, question answering, and quiz synthesis.
* **`providers/OpenAIProvider.js`, `ClaudeProvider.js`, `GrokProvider.js`**: Extensible skeleton classes throwing `"not yet implemented"` exceptions.

---

## 4. Communication & Storage Architecture

### 4.1 Client-Server Communication
* **Transport**: HTTP/1.1 REST APIs over `http://localhost:3000`.
* **Data Encodings**:
  * `application/json`: Used for control commands (`/start-session`, `/stop-session`, `/cleanup-session`, `/generate-notes`, `/ask`, `/generate-quiz`) and base64 visual frame uploads (`/save-frame`).
  * `multipart/form-data`: Handled by `multer` for binary audio chunk uploads (`/upload-audio-chunk`).
  * `application/pdf` and `text/markdown`: Binary and stream responses for `/download-pdf` and `/notes` with aggressive no-cache HTTP headers (`Cache-Control: no-store, no-cache, must-revalidate`).

### 4.2 Storage Architecture
The system avoids heavy external database servers, adopting an **isolated filesystem-based session architecture**:
* Each session receives a dedicated directory: `backend/sessions/<sessionId>/`.
* Metadata is stored in JSON (`session_metadata.json`), serialized through a promise-chained queue.
* Vector embeddings are saved in JSON vector arrays (`embeddings.json`), enabling lightweight, dependency-free in-memory cosine similarity search without requiring complex vector database infrastructure.
* Binary artifacts (JPEG frames, WebM audio chunks, compiled `lecture.webm`, and compiled `LectureNotes.pdf`) are stored in isolated per-session subdirectories.
