# Complete End-to-End Execution Workflow

This document traces the exact execution flow of the **AI Multimodal Notes Generator**, from user interaction in the Chrome extension to audio/video streaming, background deduplication, ASR transcription, multimodal timeline alignment, AI synthesis, PDF compilation, and semantic RAG querying.

---

## Stage 1: User Initialization & Session Activation

```text
[User clicks "Start Session"] 
       │
       ▼
[popup.js] (Click Listener)
       │ Reads interval dropdown (e.g., 5000ms)
       │ Queries active tab ID via chrome.tabs.query
       ▼
[chrome.runtime.sendMessage] -> action: "startSession"
       │
       ▼
[background.js] (Service Worker Listener)
       │ Delegates to SessionManager.startSession(interval, tabId)
       ▼
[SessionManager.js (Client)]
       │ 1. POST http://localhost:3000/start-session
       │    ├── [routes/api.js] -> SessionController.createSession
       │    ├── [SessionController.js] -> generates `session_<timestamp>_<random>`
       │    └── [SessionManager.js (Backend)] -> StorageManager.initSession(sessionId)
       │         └── Creates `sessions/<sessionId>/` {frames/, audio/}
       │         └── Writes initial `session_metadata.json`
       │ 2. Sets chrome.storage.local { recording: true, sessionId, startTime, ... }
       │ 3. Invokes this.createOffscreen() -> creates `offscreen.html`
       │ 4. Calls chrome.tabCapture.getMediaStreamId({ targetTabId })
       │ 5. Dispatches chrome.runtime.sendMessage({ action: "startAudio", streamId, sessionId })
       │ 6. Executes this.captureFrame() and starts setInterval(captureFrame, interval)
       ▼
[PopupStateManager.js]
       └── Detects recording: true -> Disables Start, Enables Stop, starts timer ticker
```

* **Files Responsible**: `popup.js` (L26-56), `background.js` (L13-36), `SessionManager.js` (L20-79), `controllers/SessionController.js` (L4-13), `services/SessionManager.js` (L9-36), `utils/StorageManager.js` (L20-42).

---

## Stage 2: Audio Stream Capture & Chunk Upload Pipeline

```text
[chrome.runtime.sendMessage: "startAudio"]
       │
       ▼
[offscreen.js] (Offscreen Message Listener)
       │ 1. navigator.mediaDevices.getUserMedia({
       │      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId } }
       │    })
       │ 2. Loopback to Speakers:
       │    AudioContext -> createMediaStreamSource(stream) -> connect(destination)
       │    (Ensures the student can still hear lecture audio while capturing)
       │ 3. MediaRecorder initialization:
       │    Extracts audio tracks: new MediaStream(stream.getAudioTracks())
       │    new MediaRecorder(audioStream)
       │    Records audio chunks in memory (audioChunks array)
       │ 4. 15-Second Chunk Timer (setInterval):
       │    Every 15s -> mediaRecorder.stop() -> triggers onstop event
       ▼
[mediaRecorder.onstop]
       │ 1. Assembles Blob: new Blob(audioChunks, { type: "audio/webm" })
       │ 2. Calculates chunk index & timestamp offset: (chunkIndex * 15) seconds
       │ 3. Constructs multipart FormData:
       │    formData.append("sessionId", activeSessionId)
       │    formData.append("chunkIndex", currentChunkIndex)
       │    formData.append("timestamp", currentChunkIndex * 15)
       │    formData.append("audio", audioBlob, "chunk_N.webm")
       │ 4. POST http://localhost:3000/upload-audio-chunk
       │ 5. Restarts chunk recorder if isRecording === true
       ▼
[backend/routes/api.js]
       │ Multer diskStorage intercepts request:
       │  - Destination: StorageManager.getAudioDir(sessionId) -> `sessions/<sessionId>/audio/`
       │  - Filename: `chunk_<chunkIndex>.webm`
       ▼
[backend/controllers/AudioController.js] (uploadAudioChunk)
       │ Extracts sessionId, req.file.path, chunkIndex, timestampOffset
       ▼
[backend/services/SessionManager.js] (registerAndTranscribeChunk)
       │ Returns immediate HTTP 200 response to client
       │ Spawns SpeechTranscriber.transcribeChunk(...) in background (non-blocking)
```

* **Files Responsible**: `offscreen.js` (L9-110), `routes/api.js` (L13-26, L33), `controllers/AudioController.js` (L4-26), `services/SessionManager.js` (L97-107).

---

## Stage 3: Background Audio Transcription (Faster-Whisper ASR)

```text
[SpeechTranscriber.transcribeChunk] (Background Worker)
       │ Invokes transcribeAudio(chunkPath)
       ▼
[backend/utils/transcribe.js]
       │ Spawns child process:
       │ python3 utils/transcribe.py "<path_to_chunk_N.webm>"
       ▼
[backend/utils/transcribe.py]
       │ 1. Loads WhisperModel("base", device="cpu", compute_type="int8")
       │ 2. Executes model.transcribe(audio_file)
       │ 3. Extracts [{ start, end, text }] per segment
       │ 4. Emits JSON to stdout: `[{"start": 0.0, "end": 4.5, "text": "..."}]`
       ▼
[backend/utils/transcribe.js]
       │ Intercepts stdout, parses JSON array, resolves Promise
       ▼
[backend/services/SpeechTranscriber.js]
       │ Normalizes timestamps to global session time:
       │ adjustedSegments = segments.map(seg => ({
       │    start: seg.start + timestampOffset,
       │    end: seg.end + timestampOffset,
       │    text: seg.text
       │ }))
       ▼
[backend/utils/StorageManager.js] (updateMetadata via writeQueue)
       │ Appends adjustedSegments to metadata.transcriptSegments
       │ Persists to `session_metadata.json` safely without file write races
```

* **Files Responsible**: `services/SpeechTranscriber.js` (L4-28), `utils/transcribe.js` (L4-27), `utils/transcribe.py` (L1-23), `utils/StorageManager.js` (L52-70).

---

## Stage 4: Visual Frame Capture, Deduplication & Structural OCR

```text
[SessionManager.js (Client)] (captureFrame - called every interval, e.g., 5s)
       │ 1. Checks if recording === true
       │ 2. chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 })
       │ 3. Extracts base64 image data (dataUrl.split(",")[1])
       │ 4. POST http://localhost:3000/save-frame { sessionId, image }
       ▼
[backend/routes/api.js] -> [backend/controllers/FrameController.js] (saveFrame)
       │ Validates image payload presence
       ▼
[backend/services/SessionManager.js] (saveFrame)
       │ 1. Generates filename: `frame_<Date.now()>.jpg`
       │ 2. fs.writeFileSync(filePath, imageBase64, "base64") in `sessions/<id>/frames/`
       │ 3. Returns immediate HTTP 200 { success: true, file } to client
       │ 4. Dispatches SlideExtractor.processFrame(...) in background (non-blocking)
       ▼
[backend/services/SlideExtractor.js] (processFrame)
       │ 1. Calculates relativeTimestamp = (frameTimestamp - sessionStartTime) / 1000
       │ 2. Deduplication Check:
       │    - If first frame -> marks as different (new slide)
       │    - If subsequent frame -> SlideExtractor.compareFrames(lastSlidePath, newPath)
       │         └── Executes: python3 utils/compare_frames.py "<frame1>" "<frame2>"
       │         └── [compare_frames.py]:
       │              - Converts both images to 32x32 grayscale ('L')
       │              - Calculates normalized Mean Absolute Error (MAE):
       │                mae = np.mean(np.abs(arr1 - arr2)) / 255.0
       │              - If mae > 0.015 -> outputs "true" (different slide)
       │              - Else -> outputs "false" (duplicate frame)
       │ 3. Optimization on Transition:
       │    If different from last slide, checks last 4 unique slides. If user flipped
       │    back to an earlier slide, reuses cached slideContent, completely skipping OCR!
       │ 4. If genuine new slide:
       │    Appends { slide: fileName, timestamp: relativeTimestamp, slideContent: null }
       │    to metadata.uniqueSlides via StorageManager.updateMetadata
       │ 5. Dispatches extractSlideContentBackground(...)
       ▼
[backend/services/SlideExtractor.js] (extractSlideContent)
       │ 1. Reads image as base64 string
       │ 2. Calls Ollama API: ollama.chat({
       │       model: "qwen2.5vl:3b",
       │       options: { num_ctx: 8192, temperature: 0 },
       │       messages: [ { role: "user", content: <strict JSON schema extraction prompt> } ],
       │       images: [imageBase64]
       │    })
       │ 3. Parses structured JSON output:
       │    {
       │      title: "...",
       │      visibleText: "...",
       │      bullets: [...],
       │      equations: [...],
       │      tables: [...],
       │      detectedVisuals: { flowchart: bool, blockDiagram: bool, ... },
       │      diagrams: [{ type, description }],
       │      figures: [...],
       │      charts: [...]
       │    }
       │ 4. If debugMode === true -> writes `debug_vision_<frame>.json`
       │ 5. Updates metadata.uniqueSlides with parsed slideContent
```

* **Files Responsible**: `SessionManager.js (Client)` (L107-146), `controllers/FrameController.js` (L4-17), `services/SessionManager.js` (L80-95), `services/SlideExtractor.js` (L91-166, L168-335), `utils/compare_frames.py` (L1-38).

---

## Stage 5: Session Termination & Asset Finalization

```text
[User clicks "Stop Session"]
       │
       ▼
[popup.js] -> chrome.runtime.sendMessage({ action: "stopSession" })
       │
       ▼
[background.js] -> SessionManager.stopSession()
       │
       ▼
[SessionManager.js (Client)]
       │ 1. Clears capture interval timer (stops capturing frames)
       │ 2. Updates chrome.storage.local { recording: false, sessionCompleted: true }
       │ 3. Dispatches chrome.runtime.sendMessage({ action: "stopAudio" })
       ▼
[offscreen.js] (stopAudio Listener)
       │ 1. Clears audio chunk interval timer
       │ 2. Stops MediaRecorder, flushing final audio chunk with formData "isFinal": "true"
       │ 3. Releases audio tracks (track.stop()) and AudioContext
       │ 4. Dispatches chrome.runtime.sendMessage({ action: "audioUploadComplete" })
       ▼
[background.js] (audioUploadComplete Listener)
       │ 1. POST http://localhost:3000/stop-session { sessionId }
       │ 2. Closes offscreen document: chrome.offscreen.closeDocument()
       ▼
[backend/controllers/SessionController.js] (stopSession)
       │ Delegates to SessionManager.stopSession(sessionId)
       ▼
[backend/services/SessionManager.js] (stopSession)
       │ 1. StorageManager.finalizeAudio(sessionId)
       │    - Reads all `chunk_*.webm` files in `sessions/<id>/audio/`
       │    - Sorts chunks numerically by index
       │    - Concatenates binary data into `sessions/<id>/lecture.webm`
       │ 2. Exports human-readable transcript files:
       │    - `sessions/<id>/transcript.json` (Structured array)
       │    - `sessions/<id>/transcript.txt` (Timestamped lines: `[12.5s - 25.0s] Text`)
       │ 3. Updates session_metadata.json { status: "Completed", endTime: Date.now() }
```

* **Files Responsible**: `popup.js` (L58-66), `SessionManager.js (Client)` (L81-95), `offscreen.js` (L112-171), `background.js` (L38-77), `services/SessionManager.js` (L43-78), `utils/StorageManager.js` (L95-128).

---

## Stage 6: Multimodal Note Generation & PDF Compilation

```text
[User clicks "Generate Notes"]
       │
       ▼
[popup.js] (Click Listener)
       │ POST http://localhost:3000/generate-notes { sessionId }
       ▼
[backend/controllers/NotesController.js] (generateNotes)
       │ Calls SessionManager.generateSessionNotes(sessionId)
       ▼
[backend/services/NoteGenerator.js] (generate)
       │ ── STEP 6.1: Fallback OCR Resolution
       │    Scans metadata.uniqueSlides; if any slideContent is still null,
       │    executes synchronous SlideExtractor.extractSlideContent(slide).
       │
       │ ── STEP 6.2: Temporal Alignment Engine (alignTimeline)
       │    1. Sorts unique slides chronologically by timestamp
       │    2. Creates time window intervals:
       │       Slide i: [startTime = slide[i].timestamp, endTime = slide[i+1].timestamp]
       │       (Final slide has endTime = Infinity)
       │    3. Bins all transcript segments into the corresponding slide whose
       │       time window encompasses segment.start:
       │       if (segmentStart >= window.startTime && segmentStart < window.endTime)
       │          window.transcriptSegments.push(segment.text)
       │    4. Returns alignedTimeline array combining visual OCR and spoken transcript.
       │    5. If debugMode -> writes `debug_aligned_timeline.json`
       │
       │ ── STEP 6.3: Grounded Prompt Compilation (PromptBuilder.buildNotePrompt)
       │    1. Iterates over alignedTimeline, formatting each slide:
       │       - Bullets, Equations, Tables, Visual Elements, Diagram descriptions
       │       - Spoken transcript text
       │    2. Enforces anti-hallucination system instructions:
       │       - Zero external knowledge
       │       - Strictly grounded in provided sources
       │       - Mandates `[DIAGRAM: <filename>]` tag injection below topic headers
       │         whenever a visual diagram is detected.
       │    3. If debugMode -> writes `debug_final_prompt.txt`
       │
       │ ── STEP 6.4: AI Provider Invocation
       │    1. Instantiates provider via providers/index.js (getAIProvider())
       │       - GeminiProvider (Cloud): GoogleGenerativeAI with gemini-2.5-flash
       │       - OllamaProvider (Local): Ollama chat with qwen3:4b (num_ctx: 8192)
       │    2. Awaits generated Markdown notes
       │    3. If debugMode -> writes `debug_llm_response.txt`
       │    4. Saves Markdown notes to `sessions/<id>/lecture-notes.md`
       │
       │ ── STEP 6.5: Publication-Grade PDF Compilation (PdfGenerator.generate)
       │    1. Sanitizes unicode/emojis to ASCII equivalents
       │    2. Initializes PDFDocument (PDFKit) with bufferPages: true
       │    3. Custom Markdown AST Parser:
       │       - Splits by `### Topic:` blocks
       │       - Detects `[DIAGRAM: <filename>]`
       │       - If diagram detected -> renders two-column layout:
       │         * Left column (x=50, width=280pt): Topic headings, text, bullets
       │         * Right column (x=350, width=212pt): Embeds actual slide frame JPEG
       │       - If no diagram -> full width (512pt) rendering
       │       - Handles headings, tables, blockquotes, bold/italic inline styling
       │    4. Multi-page layout engine:
       │       - Iterates through buffered pages
       │       - Adds running headers ("AI LECTURE STUDY NOTES")
       │       - Adds running footers ("Page X of Y")
       │    5. Saves compiled document to `sessions/<id>/LectureNotes.pdf`
       │
       │ ── STEP 6.6: Semantic RAG Chunking & Vector Indexing (chunkAndEmbed)
       │    1. Splits generated notes by double-newline (`\n\n`), filtering chunks > 30 chars
       │    2. Assigns incremental chunk IDs and writes `sessions/<id>/chunks.json`
       │    3. For each chunk -> calls ollama.embed({ model: "nomic-embed-text", input })
       │    4. Writes 768-dimensional vector embeddings to `sessions/<id>/embeddings.json`
       │
       ▼
[popup.js]
       │ Receives HTTP 200 { success: true, notes }
       │ Enables "Download Notes" and "Download PDF" buttons
       │ Persists notesGenerated: true in chrome.storage.local
```

* **Files Responsible**: `popup.js` (L90-121), `controllers/NotesController.js` (L8-17), `services/NoteGenerator.js` (L15-184), `utils/PromptBuilder.js` (L1-128), `providers/GeminiProvider.js` (L15-24), `providers/OllamaProvider.js` (L14-33), `services/PdfGenerator.js` (L6-525).

---

## Stage 7: Post-Session Interactions (Download, RAG Q&A, Quizzes & Cleanup)

### 7.1 Artifact Downloads
* **Download Notes**: User clicks "Download Notes" -> `chrome.tabs.create` opens `http://localhost:3000/notes?sessionId=<id>`. Handled by `NotesController.notes`, streaming `lecture-notes.md` with attachment headers.
* **Download PDF**: User clicks "Download PDF" -> `chrome.tabs.create` opens `http://localhost:3000/download-pdf?sessionId=<id>`. Handled by `NotesController.downloadPDF`, streaming `LectureNotes.pdf`.

### 7.2 Semantic Q&A via Retrieval-Augmented Generation (RAG)
```text
[POST /ask] { question: "What is the update rule for gradient descent?", sessionId: "<id>" }
       │
       ▼
[NotesController.ask]
       │ 1. Loads `sessions/<id>/embeddings.json`
       │ 2. Generates query vector:
       │    ollama.embed({ model: "nomic-embed-text", input: question })
       │ 3. Computes in-memory cosine similarity against all chunk embeddings:
       │    cosineSimilarity(queryVector, chunk.embedding) = (A · B) / (||A|| * ||B||)
       │ 4. Sorts descending by score and slices top 3 chunks
       │ 5. Assembles context string: topChunks.map(c => c.text).join("\n\n")
       │ 6. Dispatches to active provider: provider.askQuestion(question, context)
       │ 7. Returns HTTP 200 { success: true, answer }
```

### 7.3 Automated Quiz Generation
```text
[POST /generate-quiz] { sessionId: "<id>" }
       │
       ▼
[NotesController.generateQuiz]
       │ 1. Loads `sessions/<id>/lecture-notes.md` (first 3000 chars)
       │ 2. Dispatches to active provider: provider.generateQuiz(notes)
       │ 3. Strips markdown backticks (```json) and parses structured JSON:
       │    { "questions": [ { "question", "options": [...], "answer" } ] }
       │ 4. Returns HTTP 200 { success: true, quiz }
```

### 7.4 Session Cleanup & Resource Purging
```text
[User clicks "Cleanup Session"]
       │
       ▼
[popup.js] -> POST http://localhost:3000/cleanup-session { sessionId }
       │
       ▼
[NotesController.cleanupSession] -> SessionManager.cleanupSession(sessionId)
       │ 1. Permanently deletes directory `sessions/<sessionId>/` via fs.rmSync
       │ 2. If sessionId === "current", also cleans legacy root artifacts
       │ 3. StorageManager.clear() resets chrome.storage.local
       │ 4. PopupStateManager.restoreUI() resets UI to initial pristine state
```

* **Files Responsible**: `popup.js` (L68-88, L123-135), `controllers/NotesController.js` (L19-46, L48-100, L102-134, L136-155), `services/SessionManager.js` (L130-164).
