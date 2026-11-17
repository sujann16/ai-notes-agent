# Data Flow, Schemas & API Contracts

This document specifies the end-to-end data flow throughout the **AI Multimodal Notes Generator**, defining the inputs, intermediate transformations, outputs, and JSON payloads across each system component.

---

## 1. High-Level Data Transformation Lifecycle

```text
[Browser Tab Audio & Video]
       │
       ├── Video Frames: Raw Screen Pixels -> JPEG Base64 -> PIL 32x32 Grayscale Array -> MAE Float -> Qwen-VL Structured JSON
       │
       └── Audio Stream: Raw PCM WebRTC Tracks -> 15s WebM Blobs -> faster-whisper int8 ASR -> Timestamped Text Segments
                                                                                                          │
                                                                                                          ▼
                                                             [Multimodal Aligned Timeline Intermediate Representation]
                                                                                                          │
                                                                                                          ▼
                                                                                   [Anti-Hallucination Grounded Prompt]
                                                                                                          │
                                                                                                          ▼
                                                                                       [Synthesized Markdown Notes]
                                                                                                          │
                                                             ┌────────────────────────────────────────────┴────────────────────────────────────────────┐
                                                             ▼                                                                                         ▼
                                                  [PDFKit Rendering Engine]                                                               [Local RAG Indexing Pipeline]
                                                             │                                                                                         │
                                                             ▼                                                                                         ▼
                                               [Two-Column Formatted PDF]                                                            [Chunks JSON + 768d Embeddings JSON]
```

---

## 2. API Contracts & Payload Schemas

### 2.1 Session Creation (`POST /start-session`)
* **Request**: Empty body (or optional configuration parameters).
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "startTime": 1719323800000,
  "sessionId": "session_1719323800000_a8f9c1d"
}
```

---

### 2.2 Frame Upload (`POST /save-frame`)
* **Request Payload (`application/json`)**:
```json
{
  "sessionId": "session_1719323800000_a8f9c1d",
  "image": "/9j/4AAQSkZJRgABAQEASABIAAD/2wBD..." // Raw Base64 encoded JPEG string (excluding data URI scheme)
}
```
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "file": "frame_1719323805000.jpg"
}
```

---

### 2.3 Audio Chunk Upload (`POST /upload-audio-chunk`)
* **Content-Type**: `multipart/form-data`
* **Form Fields**:
  * `sessionId`: `"session_1719323800000_a8f9c1d"` (String)
  * `chunkIndex`: `"0"` (String representing integer)
  * `timestamp`: `"0.0"` (String representing float offset in seconds)
  * `isFinal`: `"true"` (Optional flag present on stop)
  * `audio`: Binary WebM audio file (`audio/webm`) named `chunk_0.webm`
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "file": "/absolute/path/to/sessions/session_.../audio/chunk_0.webm"
}
```

---

### 2.4 Session Termination (`POST /stop-session`)
* **Request Payload (`application/json`)**:
```json
{
  "sessionId": "session_1719323800000_a8f9c1d"
}
```
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "message": "Session session_1719323800000_a8f9c1d stopped and completed"
}
```

---

### 2.5 Note Generation (`POST /generate-notes`)
* **Request Payload (`application/json`)**:
```json
{
  "sessionId": "session_1719323800000_a8f9c1d"
}
```
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "notes": "# Introduction to Deep Learning\n\n## Topics Covered\n- Neural Network Architecture\n..."
}
```

---

### 2.6 Semantic Q&A Search (`POST /ask`)
* **Request Payload (`application/json`)**:
```json
{
  "sessionId": "session_1719323800000_a8f9c1d",
  "question": "What activation function is used in the hidden layer?"
}
```
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "answer": "Based on the lecture notes, the hidden layer uses the ReLU activation function."
}
```

---

### 2.7 Automated Quiz Generation (`POST /generate-quiz`)
* **Request Payload (`application/json`)**:
```json
{
  "sessionId": "session_1719323800000_a8f9c1d"
}
```
* **Response Payload (`application/json`)**:
```json
{
  "success": true,
  "quiz": {
    "questions": [
      {
        "question": "What is the primary objective of gradient descent?",
        "options": [
          "Maximize accuracy",
          "Minimize loss function",
          "Increase learning rate",
          "Initialize weights"
        ],
        "answer": "Minimize loss function"
      }
    ]
  }
}
```

---

## 3. Internal Data Structures & Disk Schemas

### 3.1 Cumulative Session Metadata (`session_metadata.json`)
Maintained and updated atomically via `StorageManager.updateMetadata`:
```json
{
  "startTime": 1719323800000,
  "status": "Completed",
  "endTime": 1719324100000,
  "uniqueSlides": [
    {
      "slide": "frame_1719323805000.jpg",
      "timestamp": 5,
      "slideContent": {
        "title": "Neural Network Architecture",
        "visibleText": "Feedforward deep neural network overview.",
        "bullets": [
          "Input layer accepts feature vectors.",
          "Hidden layers apply non-linear transformations.",
          "Output layer generates final class probabilities."
        ],
        "equations": [
          "y = f(Wx + b)"
        ],
        "tables": [],
        "detectedVisuals": {
          "flowchart": false,
          "blockDiagram": true,
          "architectureDiagram": true,
          "uml": false,
          "erDiagram": false,
          "graph": false,
          "table": false,
          "mathematicalDerivation": false
        },
        "diagrams": [
          {
            "type": "architecture diagram",
            "description": "Feedforward neural network showing input nodes connected by forward arrows to hidden ReLU nodes and output Softmax nodes."
          }
        ],
        "figures": [],
        "charts": []
      }
    }
  ],
  "transcriptSegments": [
    {
      "start": 0.0,
      "end": 6.8,
      "text": "Today we will examine feedforward neural architectures."
    },
    {
      "start": 6.8,
      "end": 14.2,
      "text": "As depicted in the diagram, inputs propagate linearly into the hidden layer."
    }
  ]
}
```

---

### 3.2 Intermediate Aligned Timeline (`debug_aligned_timeline.json`)
Constructed by `NoteGenerator.alignTimeline(uniqueSlides, transcriptSegments)`:
```json
[
  {
    "slide": "frame_1719323805000.jpg",
    "timestamp": 5,
    "startTime": 5,
    "endTime": 65,
    "slideContent": {
      "title": "Neural Network Architecture",
      "bullets": ["..."],
      "equations": ["y = f(Wx + b)"],
      "diagrams": [{ "type": "architecture diagram", "description": "..." }]
    },
    "transcriptSegments": [
      "Today we will examine feedforward neural architectures.",
      "As depicted in the diagram, inputs propagate linearly into the hidden layer."
    ]
  }
]
```

---

### 3.3 Semantic RAG Chunks (`chunks.json`) & Embeddings (`embeddings.json`)

#### `chunks.json`:
```json
[
  {
    "id": 1,
    "text": "### Topic: Neural Network Architecture\n[DIAGRAM: frame_1719323805000.jpg]\n\nThe lecture introduces feedforward neural networks. In this architecture, raw input vectors pass directly into hidden layers equipped with non-linear activation functions such as ReLU."
  }
]
```

#### `embeddings.json`:
```json
[
  {
    "id": 1,
    "text": "### Topic: Neural Network Architecture\n[DIAGRAM: frame_1719323805000.jpg]\n\nThe lecture introduces feedforward neural networks...",
    "embedding": [
      0.018241,
      -0.049102,
      0.003912,
      "... 768 floating point numbers total ..."
    ]
  }
]
```
