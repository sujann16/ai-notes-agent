# Complete Technology Stack & Version Specification

This document provides a comprehensive inventory of all technologies, frameworks, runtime environments, libraries, APIs, and AI models utilized across the entire **AI Multimodal Notes Generator** codebase. Exact versions reflect the live project environment and locked dependency trees (`package-lock.json` and Python system environment).

---

## 1. Core Runtime Environments & Specifications

| Technology / Component | Environment / Version | Description & Role |
| :--- | :--- | :--- |
| **Node.js** | `v22.15.0` | Server-side JavaScript runtime powering the Express backend, orchestrating child processes, stream handling, and file system operations. |
| **Python** | `3.13.7` | Python runtime executing machine learning sub-processes for Whisper audio transcription and image frame comparison. |
| **Chrome Extension Platform** | `Manifest V3` | Client-side platform specification utilizing background service workers and offscreen documents for secure media capture. |
| **Web Standards & APIs** | ES2022+ / HTML5 / CSS3 | Modern JavaScript modules (`import`/`export`), Fetch API, WebRTC MediaStream, AudioContext, MediaRecorder, Web Workers. |

---

## 2. Frontend Technologies (Chrome Extension)

| Library / API | Version / Spec | Responsibility in Codebase |
| :--- | :--- | :--- |
| **Chrome Extension Manifest** | `Manifest V3` | Defines declarative permissions (`activeTab`, `scripting`, `tabs`, `tabCapture`, `storage`, `offscreen`) and extension boundaries. |
| **Chrome Tab Capture API** | `chrome.tabCapture` | Generates a media stream identifier (`getMediaStreamId`) targeting active video/audio browser tabs without screen-share prompts. |
| **Chrome Tabs API** | `chrome.tabs` | Captures visible tab video frames as compressed JPEG base64 strings (`captureVisibleTab`) and queries active window tabs. |
| **Chrome Offscreen API** | `chrome.offscreen` | Spawns a hidden DOM context (`offscreen.html`) with `USER_MEDIA` justifications to run continuous WebRTC MediaRecorder sessions. |
| **Web Audio API (`AudioContext`)** | HTML5 Standard | Creates an audio routing loopback (`createMediaStreamSource` -> `destination`) preventing tab muting while simultaneously recording audio. |
| **MediaStream Recording API** | `MediaRecorder` | Encodes live tab audio tracks into 15-second WebM format chunks in browser memory. |
| **Chrome Local Storage API** | `chrome.storage.local` | Asynchronously persists client session states (`recording`, `startTime`, `captureInterval`, `notesGenerated`, `sessionId`). |

---

## 3. Backend Technologies & NPM Dependencies

All backend dependencies are defined in `backend/package.json` and resolved in `backend/package-lock.json`:

| Package Name | Exact Version | Type | Architectural Purpose |
| :--- | :--- | :--- | :--- |
| **`express`** | `5.2.1` | Direct | Core HTTP web framework providing RESTful API routing, JSON body parsing (20MB limit), and controller delegation. |
| **`@google/generative-ai`** | `0.24.1` | Direct | Official Google Gemini SDK for multimodal content generation, system instruction enforcement, grounded note synthesis, and Q&A. |
| **`ollama`** | `0.6.3` | Direct | Official client library for communicating with local Ollama daemon for vision analysis (`qwen2.5vl:3b`), instruction (`qwen3:4b`), and embeddings (`nomic-embed-text`). |
| **`pdfkit`** | `0.19.1` | Direct | Low-level PDF document creation engine used by `PdfGenerator` to build custom multi-column layouts, tables, and embed JPEG screenshots. |
| **`multer`** | `2.1.1` | Direct | Streaming multipart form-data middleware configured with dynamic disk storage to receive WebM audio chunks directly into session folders. |
| **`cors`** | `2.8.6` | Direct | Cross-Origin Resource Sharing middleware allowing the Chrome extension (originating from `chrome-extension://<id>`) to access backend APIs. |
| **`dotenv`** | `17.4.2` | Direct | Loads environment variables from `backend/.env` into `process.env`. |
| **`fs-extra`** | `11.3.5` | Direct | Enhanced file system utilities for directory operations and cleanups. |

---

## 4. Python Machine Learning & Computer Vision Stack

Sub-processes spawned via Node.js `child_process.exec`:

| Library / Module | Exact Version | Architectural Purpose |
| :--- | :--- | :--- |
| **`faster-whisper`** | `1.2.1` | Re-implementation of OpenAI's Whisper using CTranslate2. Executes fast local transcription of WebM chunks using int8 quantization on CPU. |
| **`CTranslate2`** | `4.5.0` (dependency) | Fast inference engine for Transformer models powering `faster-whisper`. |
| **`Pillow` (`PIL`)** | `12.2.0` | High-performance Python Imaging Library used in `compare_frames.py` to open, grayscale, and downscale screenshots to 32x32 pixels. |
| **`numpy`** | `2.4.6` | Numerical computing library used to compute the Mean Absolute Error (MAE) matrix between adjacent frames for slide deduplication. |

---

## 5. Artificial Intelligence Models & Configurations

| Model Name | Host / Engine | Purpose | Parameter Size / Quantization |
| :--- | :--- | :--- | :--- |
| **`gemini-2.5-flash`** | Google Cloud / Gemini API | Cloud-based synthesis of unified, strictly grounded lecture notes, RAG question answering, and automated quiz creation. | Cloud Multimodal LLM |
| **`qwen2.5vl:3b`** | Local / Ollama | Local Vision-Language Model performing slide OCR, extracting titles, bullet points, equations, tables, and classifying visual diagrams. | 3 Billion parameters (Local VLM) |
| **`qwen3:4b`** | Local / Ollama | Local instruction-tuned LLM used as an offline fallback for pedagogical note synthesis, question answering, and quiz generation. | 4 Billion parameters (Local LLM) |
| **`nomic-embed-text`** | Local / Ollama | Local text embedding model generating 768-dimensional dense vector embeddings for RAG chunk search. | 137 Million parameters (8k context) |
| **`Whisper (base)`** | Local / `faster-whisper` | Automatic Speech Recognition (ASR) converting spoken audio segments to text with word-level timestamps. | ~74 Million parameters (`int8` on CPU) |

---

## 6. Development, Testing & System Tooling

| Tool / Script | Location | Responsibility |
| :--- | :--- | :--- |
| **`test_visual_notes.js`** | `backend/test_visual_notes.js` | End-to-end integration test harness mocking metadata, frames, and transcripts to validate note generation, diagram tag insertion, and PDF compilation. |
| **`vision-test.js`** | `backend/vision-test.js` | Diagnostic script verifying local Ollama `qwen2.5vl:3b` connectivity and base64 image parsing. |
| **`ask.js`** | `backend/ask.js` | CLI testing utility for semantic search and Q&A over local `embeddings.json`. |
| **`deduplicate_slides.py`**| `backend/deduplicate_slides.py` | CLI batch deduplication utility for processing saved frame folders offline. |
| **`config.json`** | `backend/config.json` | Centralized JSON configuration setting model names, Ollama port (`11434`), and `debugMode`. |

---

## 7. Comparative Implementation Matrix: Implemented vs. Stubbed

| Component / Provider | Status | Detailed Implementation Note |
| :--- | :--- | :--- |
| **Google Gemini Provider** | **Fully Implemented** | Production-ready via `@google/generative-ai` SDK (`gemini-2.5-flash`). Handles notes, Q&A, and quizzes. |
| **Ollama Local Provider** | **Fully Implemented** | Production-ready via `ollama` SDK (`qwen3:4b`, `qwen2.5vl:3b`, `nomic-embed-text`). Handles notes, Q&A, and quizzes. |
| **OpenAI Provider** | **Stubbed Interface** | Defined in `backend/providers/OpenAIProvider.js`, but methods throw `"OpenAIProvider is not yet implemented"`. |
| **Anthropic Claude Provider** | **Stubbed Interface** | Defined in `backend/providers/ClaudeProvider.js`, but methods throw `"ClaudeProvider is not yet implemented"`. |
| **xAI Grok Provider** | **Stubbed Interface** | Defined in `backend/providers/GrokProvider.js`, but methods throw `"GrokProvider is not yet implemented"`. |
| **Vector DB Storage** | **File-Based Vectors** | Vector storage is implemented using local JSON arrays (`embeddings.json`) and in-memory cosine similarity, not an external vector database daemon (e.g., Pinecone/Milvus). |
| **OCR / Document Engine** | **VLM-Based Extraction**| Classical OCR (Tesseract / EasyOCR) is not used; visual text and diagram structures are extracted directly via Vision-Language Model (`qwen2.5vl:3b`). |
