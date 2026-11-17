# Mermaid System Architecture & Sequence Diagrams

This document contains Mermaid diagrams modeling the actual implementation of the **AI Multimodal Notes Generator**.

---

## 1. Complete System Architecture Diagram

```mermaid
flowchart TB
    subgraph ClientLayer["Frontend Client (Chrome Extension - Manifest V3)"]
        PopupUI["Popup Interface<br/>(popup.html / popup.js)"]
        PopupState["State Machine<br/>(PopupStateManager.js)"]
        ClientStorage["Client Storage Wrapper<br/>(StorageManager.js)"]
        ClientSession["Client Session Coordinator<br/>(SessionManager.js)"]
        OffscreenDoc["Offscreen Document<br/>(offscreen.html / offscreen.js)"]
        BackgroundWorker["Background Service Worker<br/>(background.js)"]
        
        PopupUI <--> PopupState
        PopupState <--> ClientStorage
        PopupUI --> ClientSession
        ClientSession --> BackgroundWorker
        ClientSession --> OffscreenDoc
    end

    subgraph ChromeAPIs["Chrome Browser APIs"]
        TabCaptureAPI["chrome.tabCapture<br/>(getMediaStreamId)"]
        TabsAPI["chrome.tabs<br/>(captureVisibleTab)"]
        LocalStorageAPI["chrome.storage.local"]
        OffscreenAPI["chrome.offscreen<br/>(createDocument)"]
    end

    ClientSession -.-> TabCaptureAPI
    ClientSession -.-> TabsAPI
    ClientSession -.-> OffscreenAPI
    ClientStorage -.-> LocalStorageAPI

    subgraph BackendGateway["Node.js / Express Server (Port 3000)"]
        ServerCore["Express App Bootstrap<br/>(server.js)"]
        CorsMiddleware["CORS Middleware<br/>(cors)"]
        JsonParser["JSON Parser (limit: 20MB)<br/>(express.json)"]
        MulterStorage["Multer Streaming DiskStorage<br/>(multer)"]
        ApiRouter["REST API Router<br/>(routes/api.js)"]

        ServerCore --> CorsMiddleware
        ServerCore --> JsonParser
        ServerCore --> ApiRouter
        ApiRouter --> MulterStorage
    end

    subgraph ControllerLayer["Controllers"]
        SessionCtrl["SessionController.js"]
        FrameCtrl["FrameController.js"]
        AudioCtrl["AudioController.js"]
        NotesCtrl["NotesController.js"]
        
        ApiRouter --> SessionCtrl
        ApiRouter --> FrameCtrl
        ApiRouter --> AudioCtrl
        ApiRouter --> NotesCtrl
    end

    subgraph ServiceLayer["Service & Processing Orchestration"]
        BackendSessionMgr["SessionManager.js"]
        SlideExtractSvc["SlideExtractor.js"]
        SpeechTranscriberSvc["SpeechTranscriber.js"]
        NoteGenSvc["NoteGenerator.js"]
        PdfGenSvc["PdfGenerator.js"]
        PromptBld["PromptBuilder.js"]

        SessionCtrl --> BackendSessionMgr
        FrameCtrl --> BackendSessionMgr
        AudioCtrl --> BackendSessionMgr
        NotesCtrl --> BackendSessionMgr
        NotesCtrl --> NoteGenSvc

        BackendSessionMgr --> SlideExtractSvc
        BackendSessionMgr --> SpeechTranscriberSvc
        BackendSessionMgr --> NoteGenSvc
        NoteGenSvc --> PromptBld
        NoteGenSvc --> PdfGenSvc
    end

    subgraph SubprocessLayer["Python & Native ML Workers"]
        FrameCompWorker["compare_frames.py<br/>(PIL + NumPy MAE)"]
        WhisperWorker["transcribe.py<br/>(faster-whisper INT8 CPU)"]
        
        SlideExtractSvc -->|child_process.exec| FrameCompWorker
        SpeechTranscriberSvc -->|child_process.exec| WhisperWorker
    end

    subgraph StorageLayer["Session Filesystem Storage"]
        DiskManager["StorageManager.js<br/>(writeQueue Promise Chain)"]
        SessionStore["backend/sessions/<sessionId>/<br/>- frames/*.jpg<br/>- audio/*.webm<br/>- lecture.webm<br/>- session_metadata.json<br/>- lecture-notes.md<br/>- LectureNotes.pdf<br/>- chunks.json<br/>- embeddings.json"]
        
        BackendSessionMgr --> DiskManager
        SlideExtractSvc --> DiskManager
        SpeechTranscriberSvc --> DiskManager
        NoteGenSvc --> DiskManager
        PdfGenSvc --> DiskManager
        DiskManager --> SessionStore
    end

    subgraph AIProviderLayer["AI Providers & External Engines"]
        ProviderFactory["Provider Factory<br/>(providers/index.js)"]
        GeminiEng["GeminiProvider.js<br/>(gemini-2.5-flash)"]
        OllamaEng["OllamaProvider.js<br/>(qwen3:4b)"]
        OllamaVision["Ollama Vision Engine<br/>(qwen2.5vl:3b)"]
        OllamaEmbed["Ollama Embedding Engine<br/>(nomic-embed-text)"]

        NoteGenSvc --> ProviderFactory
        NotesCtrl --> ProviderFactory
        ProviderFactory --> GeminiEng
        ProviderFactory --> OllamaEng
        SlideExtractSvc --> OllamaVision
        NoteGenSvc --> OllamaEmbed
        NotesCtrl --> OllamaEmbed
    end

    %% Network Connections
    ClientSession -->|POST /save-frame<br/>Base64 JPEG| ApiRouter
    OffscreenDoc -->|POST /upload-audio-chunk<br/>Multipart WebM| ApiRouter
    ClientSession -->|POST /start-session<br/>POST /stop-session| ApiRouter
    PopupUI -->|POST /generate-notes<br/>GET /download-pdf<br/>POST /ask| ApiRouter
```

---

## 2. End-to-End Multimodal Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Student
    participant Popup as popup.js / PopupStateManager
    participant BG as background.js (Service Worker)
    participant Offscreen as offscreen.js (WebRTC Context)
    participant Backend as Express Server (routes/api.js)
    participant Python as Python ML Subprocesses
    participant Storage as StorageManager (writeQueue)
    participant AI as AI Engine (Ollama / Gemini)
    participant PDF as PdfGenerator

    Note over User,Popup: 1. Session Initialization
    User->>Popup: Click "Start Session"
    Popup->>BG: chrome.runtime.sendMessage({ action: "startSession" })
    BG->>Backend: POST /start-session
    Backend->>Storage: initSession(sessionId)
    Storage-->>Backend: Session initialized
    Backend-->>BG: { success: true, sessionId }
    BG->>Offscreen: Create offscreen doc & send { action: "startAudio", streamId }
    
    par Audio Recording Loop (Every 15s)
        loop Continuous WebM Chunking
            Offscreen->>Offscreen: Record tab audio (MediaRecorder)
            Offscreen->>Backend: POST /upload-audio-chunk (FormData)
            Backend->>Python: exec python3 transcribe.py chunk_N.webm
            Python-->>Backend: [{ start, end, text }] (JSON)
            Backend->>Storage: updateMetadata (adjusted transcript segments)
        end
    and Video Frame Capture Loop (Every 5s)
        loop Periodic Visible Tab Capture
            BG->>Backend: POST /save-frame { sessionId, image: Base64 }
            Backend->>Python: exec python3 compare_frames.py frame1 frame2
            alt MAE > 0.015 (New Slide Detected)
                Python-->>Backend: stdout "true"
                Backend->>AI: ollama.chat(qwen2.5vl:3b, image)
                AI-->>Backend: Structured JSON (bullets, equations, diagrams)
                Backend->>Storage: updateMetadata (uniqueSlides.push)
            else MAE <= 0.015 (Duplicate Frame)
                Python-->>Backend: stdout "false"
                Backend->>Backend: Discard duplicate frame
            end
        end
    end

    Note over User,Popup: 2. Session Finalization
    User->>Popup: Click "Stop Session"
    Popup->>BG: chrome.runtime.sendMessage({ action: "stopSession" })
    BG->>Offscreen: Send { action: "stopAudio" }
    Offscreen->>Backend: POST final audio chunk (isFinal: "true")
    Offscreen->>BG: Send { action: "audioUploadComplete" }
    BG->>Backend: POST /stop-session
    Backend->>Storage: finalizeAudio() -> concatenate to lecture.webm
    Backend->>Storage: write transcript.json & transcript.txt
    BG->>Offscreen: Close offscreen document

    Note over User,Popup: 3. Note Generation & PDF Compilation
    User->>Popup: Click "Generate Notes"
    Popup->>Backend: POST /generate-notes { sessionId }
    Backend->>Backend: alignTimeline(uniqueSlides, transcriptSegments)
    Backend->>Backend: PromptBuilder.buildNotePrompt(alignedTimeline)
    Backend->>AI: generateNotes(prompt with strict grounding rules)
    AI-->>Backend: Synthesized Markdown Notes
    Backend->>Storage: saveNotes("lecture-notes.md")
    Backend->>PDF: generate(sessionId, notes)
    PDF->>Storage: savePdf("LectureNotes.pdf")
    Backend->>AI: ollama.embed(nomic-embed-text, chunks)
    AI-->>Backend: 768-dim vector embeddings
    Backend->>Storage: saveEmbeddings("embeddings.json")
    Backend-->>Popup: { success: true, notes }

    Note over User,Popup: 4. Export & Download
    User->>Popup: Click "Download PDF"
    Popup->>Backend: GET /download-pdf?sessionId=<id>
    Backend-->>User: LectureNotes.pdf (Stream download)
```

---

## 3. Multimodal Temporal Synchronization & Alignment Flow

```mermaid
flowchart LR
    subgraph AudioStream["Audio Stream (Continuous)"]
        A1["Chunk 0 [0s - 15s]<br/>Transcript A"]
        A2["Chunk 1 [15s - 30s]<br/>Transcript B"]
        A3["Chunk 2 [30s - 45s]<br/>Transcript C"]
        A4["Chunk 3 [45s - 60s]<br/>Transcript D"]
    end

    subgraph VisualStream["Visual Stream (Event-Driven)"]
        S1["Slide 1 (t = 0s)<br/>Window: [0s - 30s)"]
        S2["Slide 2 (t = 30s)<br/>Window: [30s - 60s)"]
    end

    subgraph AlignmentEngine["NoteGenerator.alignTimeline()"]
        W1["Topic Block 1<br/>- Slide 1 OCR (Title, Bullets, Diagram)<br/>- Transcripts A + B (0s - 30s)"]
        W2["Topic Block 2<br/>- Slide 2 OCR (Title, Equations, Table)<br/>- Transcripts C + D (30s - 60s)"]
    end

    A1 --> W1
    A2 --> W1
    S1 --> W1

    A3 --> W2
    A4 --> W2
    S2 --> W2

    subgraph PromptCompilation["PromptBuilder.buildNotePrompt()"]
        FinalPrompt["Strictly Grounded Prompt<br/>- Grounded System Instruction<br/>- Structured Multimodal Topics<br/>- [DIAGRAM: frame_N.jpg] Directives"]
    end

    W1 --> FinalPrompt
    W2 --> FinalPrompt
```

---

## 4. RAG Vector Indexing & In-Memory Cosine Retrieval Flow

```mermaid
flowchart TD
    subgraph IndexingPhase["1. Note Indexing Pipeline (Post-Generation)"]
        NotesText["lecture-notes.md"] --> Splitter["Paragraph Splitter<br/>(split by double newline, len > 30)"]
        Splitter --> ChunksJson["chunks.json<br/>[{ id: 1, text: '...' }]"]
        ChunksJson --> NomicEmbed["Ollama nomic-embed-text<br/>(Local 768d dense vectors)"]
        NomicEmbed --> EmbeddingsJson["embeddings.json<br/>[{ id: 1, text: '...', embedding: [...] }]"]
    end

    subgraph QueryPhase["2. Interactive Semantic Retrieval (/ask)"]
        UserQuery["User Question:<br/>'How does backpropagation update weights?'"]
        UserQuery --> QueryEmbed["ollama.embed(nomic-embed-text)"]
        QueryEmbed --> QueryVector["Query Vector<br/>q in R^768"]
        
        EmbeddingsJson --> CosineEngine["In-Memory Cosine Similarity Engine<br/>cos(q, c) = (q . c) / (||q|| * ||c||)"]
        QueryVector --> CosineEngine
        
        CosineEngine --> Sorter["Descending Score Sort & Slice"]
        Sorter --> Top3Chunks["Top 3 Context Chunks"]
        Top3Chunks --> PromptContext["Context Block Injected into LLM Prompt"]
        UserQuery --> PromptContext
        
        PromptContext --> LLMCall["Active Provider (Gemini / Ollama)<br/>Strictly grounded answering"]
        LLMCall --> FinalAnswer["Grounded Answer Payload<br/>{ success: true, answer: '...' }"]
    end
```

---

## 5. Class Diagram: AI Provider Abstraction Pattern

```mermaid
classDiagram
    class AIProvider {
        <<abstract>>
        +generateNotes(alignedTimeline) Promise~string~*
        +askQuestion(question, context) Promise~string~*
        +generateQuiz(notes) Promise~string~*
    }

    class GeminiProvider {
        -genAI: GoogleGenerativeAI
        -apiKey: string
        -modelName: string
        +generateNotes(alignedTimeline) Promise~string~
        +askQuestion(question, context) Promise~string~
        +generateQuiz(notes) Promise~string~
    }

    class OllamaProvider {
        -ollama: Ollama
        -host: string
        -modelName: string
        +generateNotes(alignedTimeline) Promise~string~
        +askQuestion(question, context) Promise~string~
        +generateQuiz(notes) Promise~string~
    }

    class OpenAIProvider {
        +generateNotes(alignedTimeline) [Throws Not Implemented]
        +askQuestion(question, context) [Throws Not Implemented]
        +generateQuiz(notes) [Throws Not Implemented]
    }

    class ClaudeProvider {
        +generateNotes(alignedTimeline) [Throws Not Implemented]
        +askQuestion(question, context) [Throws Not Implemented]
        +generateQuiz(notes) [Throws Not Implemented]
    }

    class GrokProvider {
        +generateNotes(alignedTimeline) [Throws Not Implemented]
        +askQuestion(question, context) [Throws Not Implemented]
        +generateQuiz(notes) [Throws Not Implemented]
    }

    class ProviderFactory {
        +getAIProvider() AIProvider
    }

    AIProvider <|-- GeminiProvider
    AIProvider <|-- OllamaProvider
    AIProvider <|-- OpenAIProvider
    AIProvider <|-- ClaudeProvider
    AIProvider <|-- GrokProvider
    ProviderFactory ..> AIProvider : instantiates
```

