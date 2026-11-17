# HPE Technical Interview Preparation Guide

This guide is tailored specifically for **Hewlett Packard Enterprise (HPE)** technical interviews. HPE places significant emphasis on systems architecture, edge computing, AI model optimization, distributed processing, concurrency, memory management, and scalable cloud/hybrid software design.

---

## 1. 30 Core Technical Concepts Mastered in This Project

1. **Manifest V3 Architecture**: The modern Chrome extension execution model replacing background pages with ephemeral service workers and dedicated offscreen documents.
2. **Chrome Offscreen Documents**: Sandboxed DOM environments running in the background to access DOM-restricted APIs like `navigator.mediaDevices.getUserMedia` and WebRTC.
3. **WebRTC MediaStream & Tab Capture**: Capturing live browser tab audio/video without system-level permissions or screen-sharing dialog prompts.
4. **Web Audio API Loopback**: Creating an `AudioContext` routing graph (`source.connect(destination)`) to prevent tab audio from muting while recording.
5. **MediaRecorder Chunking**: Incremental slicing of live audio streams into independent WebM format blobs for near-real-time streaming.
6. **Automatic Speech Recognition (ASR)**: Sequence-to-sequence neural speech recognition mapping continuous acoustic features into textual segments.
7. **Model Quantization (INT8)**: Reducing model weight precision from 32-bit floating point to 8-bit integers, slashing memory bandwidth and accelerating CPU inference.
8. **CTranslate2 Inference Engine**: Optimized C++ execution engine for Transformer models providing tensor parallelization and memory efficiency.
9. **Mean Absolute Error (MAE) Image Comparison**: Normalized L1 distance calculation across pixel intensity arrays used for image difference detection.
10. **Image Grayscaling & Downscaling**: Preprocessing high-resolution images to low-dimensional matrices (32x32) to ensure invariant, noise-resilient comparison.
11. **Vision-Language Models (VLMs)**: Multimodal deep learning architectures capable of jointly processing visual pixels and textual instructions.
12. **Zero-Temperature Inference**: Setting sampling temperature to 0.0 to eliminate randomness, forcing greedy deterministic decoding for factual extraction.
13. **Multimodal Temporal Synchronization**: Algorithmic alignment of disjoint asynchronous data streams using discrete time-window binning.
14. **Anti-Hallucination Prompt Engineering**: Crafting strict system instructions with negative constraints to bind LLM generation purely to ground-truth sources.
15. **Visual Anchor Injection (`[DIAGRAM: <file>]`)**: Instructing LLMs to output programmatic tokens that guide downstream document rendering pipelines.
16. **PDF Coordinate Layout Engines**: Low-level programmatic rendering of vector shapes, text wrapping, and images using absolute Cartesian coordinates in PDFKit.
17. **Two-Column Document Pagination**: Calculating dynamic vertical space and splitting page real estate into synchronized parallel columns.
18. **Retrieval-Augmented Generation (RAG)**: Enhancing LLM generation by retrieving relevant ground-truth document vectors from an external index.
19. **Dense Vector Embeddings**: Projecting semantic textual meaning into continuous high-dimensional vector spaces (e.g., 768 dimensions).
20. **Cosine Similarity**: Measuring the angular cosine distance between two dense vectors to quantify semantic relatedness regardless of magnitude.
21. **Inverted vs. Dense Indexing**: Comparing traditional keyword search (TF-IDF/BM25) with semantic vector space retrieval.
22. **Promise-Chained Serialized Queue**: Using sequential Promise resolution (`writeQueue = writeQueue.then(...)`) to enforce atomic file access.
23. **Idempotent File Cleanup**: Implementing recursive directory removal operations that guarantee identical state regardless of prior failure.
24. **Multipart Form-Data Streaming**: Handling binary file streams over HTTP using Multer without buffering entire files in heap memory.
25. **Factory Pattern in Provider Design**: Decoupling caller business logic from provider implementations through an abstract interface and factory resolver.
26. **Edge vs. Cloud AI Offloading**: Strategically partitioning compute tasks between local hardware (edge) and cloud accelerators (Gemini API).
27. **IPC via Subprocesses**: Orchestrating cross-language communication between Node.js and Python via standard I/O pipes (`stdin`/`stdout`).
28. **Cross-Origin Resource Sharing (CORS)**: Configuring HTTP response headers to allow sandboxed browser extensions to access localhost APIs.
29. **Non-Blocking Background Dispatch**: Responding immediately with HTTP 200 while scheduling heavy compute operations asynchronously.
30. **Memory Leak Prevention in Continuous Recording**: Explicitly disposing of `MediaStream` tracks, `AudioContext` nodes, and clearing `setInterval` timers upon session closure.

---

## 2. 25 Project-Specific Interview Questions & Model Answers

### Q1: Why did you choose Chrome Manifest V3 instead of an electron app or desktop recorder?
**Model Answer**: Manifest V3 integrates directly into the student's existing learning environment (Google Meet, Coursera, YouTube, Canvas). It captures pristine digital tab audio and video directly through `chrome.tabCapture` without capturing background room noise, microphone feedback, or requiring users to install native desktop recording software.

### Q2: How does your audio recording work without muting the user's tab?
**Model Answer**: When `chrome.tabCapture` captures an audio stream, Chrome automatically mutes the target tab. To fix this, in `offscreen.js` I initialized a Web Audio API `AudioContext`, created a media stream source from the captured stream, and connected it directly to `audioContext.destination`. This loops the audio back to the user's speakers while simultaneously routing the tracks to `MediaRecorder`.

### Q3: Why did you use an offscreen document instead of running recording inside the background service worker?
**Model Answer**: Under Manifest V3, background service workers run in an ephemeral worker environment without access to the DOM or WebRTC audio APIs like `navigator.mediaDevices.getUserMedia`. An offscreen document provides a dedicated DOM context justified with `USER_MEDIA` permissions, allowing long-running `MediaRecorder` instances to operate reliably.

### Q4: How do you prevent redundant vision LLM calls on static lecture slides?
**Model Answer**: I implemented a localized Mean Absolute Error (MAE) deduplication algorithm in Python (`compare_frames.py`). Frames are downscaled to 32x32 grayscale arrays. If the normalized pixel difference between the current frame and the preceding slide is $\le 0.015$, the frame is discarded. Furthermore, if a slide changes, the system checks the last 4 unique slides to determine if the lecturer returned to a previous slide, reusing cached OCR results.

### Q5: Why did you choose faster-whisper over standard OpenAI Whisper?
**Model Answer**: `faster-whisper` uses CTranslate2, an optimized C++ inference engine for Transformer models. By quantizing the `base` model to 8-bit integers (`compute_type="int8"` on CPU), it runs up to 4x faster with a fraction of the memory footprint compared to vanilla PyTorch Whisper, achieving near-real-time transcription on standard CPUs.

### Q6: How do you handle timestamp synchronization between audio chunks and slide frames?
**Model Answer**: Each 15-second audio chunk carries a `timestampOffset = chunkIndex * 15`. Whisper segment timestamps (`start` and `end`) are adjusted by adding this offset. Slide frames record their relative timestamp as $\frac{\text{frameTime} - \text{sessionStartTime}}{1000}$. In `NoteGenerator.alignTimeline`, non-overlapping temporal windows $[t_i, t_{i+1})$ are created for each slide, and transcript segments are slotted into whichever slide interval their start timestamp falls into.

### Q7: How do you prevent file write race conditions when metadata is updated concurrently?
**Model Answer**: In `backend/utils/StorageManager.js`, I implemented an asynchronous Promise queue: `writeQueue = writeQueue.then(...)`. Every metadata mutation is chained onto this queue, ensuring that reading, mutating, and writing `session_metadata.json` occurs strictly sequentially.

### Q8: What was your strategy for prompt engineering to eliminate LLM hallucinations?
**Model Answer**: In `PromptBuilder.js`, I enforced strict negative grounding rules in the system instructions: zero external knowledge, mandatory attribution to slide content or transcripts, omitting unmentioned details, and requiring the exact tag `[DIAGRAM: <filename>]` directly below topic sub-headings when visual diagrams are present.

### Q9: How does the PDF generator embed slide screenshots next to explanatory text?
**Model Answer**: In `PdfGenerator.js`, the custom Markdown parser scans for the `[DIAGRAM: <filename>]` tag. When detected, it transitions from a single-column layout (512pt width) to a two-column coordinate layout. It renders the topic text in a left column (width 280pt at $x=50$) and embeds the corresponding slide frame from disk in the right column (width 212pt at $x=350$).

### Q10: How does your local RAG system work?
**Model Answer**: Generated notes are chunked by paragraph (`\n\n`) and filtered for minimum length ($>30$ characters). Each chunk is converted into a 768-dimensional dense vector via Ollama's `nomic-embed-text` and saved to `embeddings.json`. When a user submits a question via `/ask`, the query is embedded using the same model, scored against all stored vectors using in-memory cosine similarity, and the top 3 chunks are passed as context to the LLM.

### Q11: Why didn't you use an external vector database like Pinecone or Milvus?
**Model Answer**: For single-lecture study sessions, typical note documents contain between 15 and 50 chunks. Storing vectors in an in-memory JSON array and computing cosine similarity takes less than 2 milliseconds. Introducing a heavy external vector database would add unnecessary architectural complexity and network overhead. However, for an enterprise multi-lecture deployment, migrating to an indexed vector database like Qdrant or Milvus would be appropriate.

### Q12: How do you handle model failure or Ollama being offline?
**Model Answer**: The architecture features a pluggable AI Provider interface (`AIProvider.js`). If local Ollama inference fails or is unavailable, the system can seamlessly route to the Google Gemini cloud provider (`GeminiProvider.js`), and vice versa.

### Q13: Explain the role of `isFinal: "true"` during audio upload.
**Model Answer**: When the user clicks "Stop Session", the ongoing 15-second timer is cleared, but there may be buffered audio in the `MediaRecorder`. The recorder is stopped with an overridden `onstop` callback that tags the final chunk with `isFinal: "true"` and sends an `audioUploadComplete` message to the background worker so it knows all audio data has safely reached the server before closing the offscreen document.

### Q14: How does `finalizeAudio` work on the backend?
**Model Answer**: In `StorageManager.finalizeAudio`, the backend scans the session's audio directory for all `chunk_*.webm` files, sorts them numerically by index, and streams their binary buffers sequentially into a single consolidated `lecture.webm` file.

### Q15: What happens if a user navigates between multiple tabs during a lecture?
**Model Answer**: The audio capture is bound to the target tab via `targetTabId` and continues recording uninterrupted regardless of user tab switching. Visual capture (`chrome.tabs.captureVisibleTab`), however, captures the currently visible tab. In production, this can be locked strictly to the lecture tab using `tabCapture` video streams.

### Q16: How do you handle non-ASCII characters or emojis in PDFKit?
**Model Answer**: Standard Helvetica fonts in PDFKit crash or render missing glyph boxes when encountering Unicode emojis. In `PdfGenerator.cleanUnicode`, I implemented a sanitization filter that maps common emojis to ASCII equivalents (e.g., 💡 to "Tip: ", ✅ to "[OK]", → to "->") and strips non-ASCII characters.

### Q17: What is the benefit of setting temperature to 0 in `SlideExtractor`?
**Model Answer**: Slide extraction requires objective, factual transcription of slide content (bullet points, equations, tables). Setting temperature to 0 forces greedy decoding, maximizing factual precision and ensuring valid JSON schema output without creative embellishments.

### Q18: What is the purpose of the 20MB body-parser limit in `server.js`?
**Model Answer**: High-resolution screenshots captured via `captureVisibleTab` encoded as base64 JPEG strings typically exceed the default 100KB or 1MB limits in Express. A 20MB limit ensures that uncompressed high-DPI frame payloads are parsed without triggering `413 Payload Too Large` errors.

### Q19: How do you prevent memory leaks in the Node.js backend when multiple sessions run?
**Model Answer**: The backend avoids holding large image buffers or audio streams in memory. Multer streams audio chunks directly to disk, frames are written to disk immediately upon receipt, and child processes exit after execution. Furthermore, `/cleanup-session` allows complete directory removal.

### Q20: How are mathematical equations preserved across the pipeline?
**Model Answer**: `SlideExtractor.js` instructs Qwen-VL to parse formulas into an `equations` array. `PromptBuilder.js` formats them with markdown bullet syntax, and the PDF rendering engine formats them using dedicated indentation and styling.

### Q21: Explain the purpose of `debugMode` in `config.json`.
**Model Answer**: When enabled, the backend writes detailed inspection artifacts to the session directory: `debug_aligned_timeline.json`, `debug_final_prompt.txt`, `debug_llm_response.txt`, and `debug_vision_<frame>.json`. This provides complete observability into intermediate AI transformations.

### Q22: What are the security implications of using `host_permissions: ["<all_urls>"]` in `manifest.json`?
**Model Answer**: While broad, it allows the extension to capture video frames and audio across any lecture platform (Zoom web client, Google Meet, YouTube, Panopto). In an enterprise build, permissions can be narrowed to explicit declarative patterns.

### Q23: Why do you execute Python scripts via `child_process.exec` instead of running a Python backend?
**Model Answer**: Node.js excels at asynchronous I/O, WebSockets, streaming file uploads, and HTTP routing. Python excels at machine learning and numerical computation. Calling lightweight Python CLI sub-processes combines Node's high-concurrency event loop with Python's deep ML ecosystem.

### Q24: How does the system handle corrupt or empty audio chunks?
**Model Answer**: `MediaRecorder.ondataavailable` only pushes data if `event.data.size > 0`. On the backend, `AudioController` validates `req.file` presence and wraps transcription in try-catch blocks, ensuring an audio processing error does not crash the server.

### Q25: How would you scale this architecture to support 10,000 concurrent students at HPE?
**Model Answer**: Replace the local Express backend with a microservices architecture: an API gateway for ingest, S3/MinIO object storage for media chunks, a distributed task queue (Celery/Kafka) with GPU worker pools running Triton Inference Server for Whisper and Vision models, and a distributed vector database (Milvus/Qdrant) for RAG.

---

## 3. 15 Python Coding Interview Questions (Based on Implementation)

### Code 1: Mean Absolute Error (MAE) Frame Comparison
```python
import numpy as np
from PIL import Image

def are_images_different(img_path1: str, img_path2: str, threshold: float = 0.015) -> bool:
    """
    Compares two images using normalized Mean Absolute Error (MAE) on 32x32 grayscale arrays.
    """
    try:
        img1 = Image.open(img_path1).convert('L').resize((32, 32))
        img2 = Image.open(img_path2).convert('L').resize((32, 32))
        
        arr1 = np.array(img1, dtype=np.float32)
        arr2 = np.array(img2, dtype=np.float32)
        
        mae = np.mean(np.abs(arr1 - arr2)) / 255.0
        return bool(mae > threshold)
    except Exception:
        return True
```

### Code 2: Vector Cosine Similarity
```python
import numpy as np

def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """
    Calculates cosine similarity between two dense 1D vectors.
    """
    a = np.array(v1, dtype=np.float32)
    b = np.array(v2, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
```

### Code 3: Top-K Vector Retrieval
```python
def retrieve_top_k(query_vector: list[float], chunks: list[dict], k: int = 3) -> list[dict]:
    """
    Ranks chunks by cosine similarity to query_vector and returns top k chunks.
    """
    scored = []
    for chunk in chunks:
        score = cosine_similarity(query_vector, chunk["embedding"])
        scored.append((score, chunk))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:k]]
```

### Code 4: Faster-Whisper Quantized Transcription Wrapper
```python
from faster_whisper import WhisperModel

def transcribe_audio_chunk(audio_path: str, model_size: str = "base") -> list[dict]:
    """
    Transcribes audio chunk with faster-whisper using INT8 quantization on CPU.
    """
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio_path)
    return [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segments]
```

### Code 5: Multimodal Temporal Alignment
```python
def align_multimodal_timeline(slides: list[dict], transcripts: list[dict]) -> list[dict]:
    """
    Aligns transcripts into slide windows based on start/end timestamps.
    """
    sorted_slides = sorted(slides, key=lambda s: s["timestamp"])
    aligned = []
    
    for i, slide in enumerate(sorted_slides):
        start_t = slide["timestamp"]
        end_t = sorted_slides[i + 1]["timestamp"] if i + 1 < len(sorted_slides) else float("inf")
        aligned.append({
            "slide": slide["slide"],
            "start": start_t,
            "end": end_t,
            "content": slide.get("slideContent"),
            "transcripts": []
        })
        
    for seg in transcripts:
        seg_start = seg["start"]
        for window in aligned:
            if window["start"] <= seg_start < window["end"]:
                window["transcripts"].append(seg["text"])
                break
                
    return aligned
```

### Code 6: Text Paragraph Chunking
```python
def chunk_markdown_text(text: str, min_length: int = 30) -> list[dict]:
    """
    Splits text by double newlines and filters out small chunks.
    """
    raw_chunks = text.split("\n\n")
    valid_chunks = [c.strip() for c in raw_chunks if len(c.strip()) > min_length]
    return [{"id": i + 1, "text": chunk} for i, chunk in enumerate(valid_chunks)]
```

### Code 7: Batch Audio WebM Concatenation
```python
import os

def concatenate_webm_chunks(audio_dir: str, output_path: str) -> None:
    """
    Sequentially concatenates chunk_N.webm files into a single webm file.
    """
    files = [f for f in os.listdir(audio_dir) if f.startswith("chunk_") and f.endswith(".webm")]
    files.sort(key=lambda x: int(x.replace("chunk_", "").replace(".webm", "")))
    
    with open(output_path, "wb") as outfile:
        for f in files:
            with open(os.path.join(audio_dir, f), "rb") as infile:
                outfile.write(infile.read())
```

### Code 8: Moving Average Smoothing for Audio Signal
```python
def moving_average(signal: list[float], window_size: int = 5) -> list[float]:
    """
    Applies moving average filter to smooth noisy audio amplitude values.
    """
    if window_size < 1:
        return signal
    weights = np.ones(window_size) / window_size
    return list(np.convolve(signal, weights, mode='valid'))
```

### Code 9: Sliding Window Token Overlap Chunking
```python
def sliding_window_chunking(text: str, window_size: int = 200, overlap: int = 50) -> list[str]:
    """
    Chunks text with overlapping word windows.
    """
    words = text.split()
    chunks = []
    step = window_size - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i:i + window_size])
        chunks.append(chunk)
        if i + window_size >= len(words):
            break
    return chunks
```

### Code 10: JSON Output Sanitizer from LLM Markdown Block
```python
import json
import re

def parse_llm_json(raw_response: str) -> dict:
    """
    Strips markdown code fences and safely parses JSON from LLM output.
    """
    cleaned = re.sub(r"^```json\s*", "", raw_response.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"^```\s*$", "", cleaned.strip(), flags=re.MULTILINE)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"error": "Invalid JSON format", "raw": raw_response}
```

### Code 11: Image Aspect Ratio Preserving Downscale
```python
from PIL import Image

def resize_with_aspect_ratio(image_path: str, max_dimension: int = 1024) -> Image.Image:
    """
    Resizes image maintaining original aspect ratio.
    """
    img = Image.open(image_path)
    w, h = img.size
    scaling_factor = min(max_dimension / w, max_dimension / h, 1.0)
    new_size = (int(w * scaling_factor), int(h * scaling_factor))
    return img.resize(new_size, Image.Resampling.LANCZOS)
```

### Code 12: Exponential Backoff Retry Decorator
```python
import time
from functools import wraps

def retry_with_backoff(retries: int = 3, base_delay: float = 1.0):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            delay = base_delay
            for attempt in range(retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == retries - 1:
                        raise e
                    time.sleep(delay)
                    delay *= 2.0
        return wrapper
    return decorator
```

### Code 13: Extract Image Metadata from JPEG Headers
```python
def get_jpeg_dimensions(file_path: str) -> tuple[int, int]:
    """
    Extracts JPEG width and height directly by parsing binary headers.
    """
    with open(file_path, 'rb') as f:
        f.seek(2)
        while True:
            marker, length = f.read(2), int.from_bytes(f.read(2), 'big')
            if marker in (b'\xff\xc0', b'\xff\xc2'):
                f.read(1)
                height = int.from_bytes(f.read(2), 'big')
                width = int.from_bytes(f.read(2), 'big')
                return width, height
            f.seek(length - 2, 1)
```

### Code 14: Batch Processing Queue Worker
```python
from queue import Queue
from threading import Thread

def worker(q: Queue, process_fn):
    while True:
        item = q.get()
        if item is None:
            break
        try:
            process_fn(item)
        finally:
            q.task_done()
```

### Code 15: Memory-Mapped File Chunk Reader
```python
import mmap

def read_large_audio_chunk(file_path: str, offset: int, size: int) -> bytes:
    """
    Reads a segment of a large audio file without loading entire file into RAM.
    """
    with open(file_path, "rb") as f:
        with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            return mm[offset:offset + size]
```

---

## 4. 10 System-Design & Architecture Questions

1. **Scalability Bottleneck**: How would you decouple Whisper transcription and Qwen-VL extraction from the main Node.js web process to prevent CPU starvation under high concurrency?
2. **Streaming Ingestion**: How would you migrate from 15-second polling/chunking to continuous bidirectional WebSocket/gRPC streams?
3. **GPU Cluster Resource Scheduling**: How would you design a multi-tenant inference cluster utilizing Triton Inference Server to dynamically batch Whisper and Vision requests across a shared pool of NVIDIA GPUs?
4. **Distributed Storage Layer**: How would you transition this single-server filesystem design to a distributed object storage architecture (Ceph / MinIO / AWS S3) with signed URLs?
5. **Stateful vs. Stateless Backends**: How would you redesign `SessionManager` so that any backend node behind a load balancer can process incoming chunks for any active session?
6. **Vector Search at Scale**: When scaling to thousands of lectures, how would you migrate from in-memory cosine similarity to an Approximate Nearest Neighbor (ANN) index using HNSW in Milvus or Qdrant?
7. **Resilience & Fault Tolerance**: If a node crashes mid-lecture, how does the system recover incomplete audio chunks and avoid missing slide transitions?
8. **Edge Computing Optimization**: How could the frame comparison and initial Whisper ASR be shifted entirely into the client browser using WebAssembly (Wasm) and WebGPU?
9. **Real-time Live Note Streaming**: How would you stream the generated notes incrementally to the user UI using Server-Sent Events (SSE) while the lecture is still in progress?
10. **Data Privacy & Compliance**: How would you architect this system to guarantee strict GDPR and HIPAA compliance when recording sensitive enterprise presentations?

---

## 5. 10 Scenario-Based Engineering Questions

1. **Scenario 1**: A professor's microphone has intermittent connection, creating silent or corrupted WebM chunks. How does your pipeline prevent Whisper from hanging or throwing unhandled exceptions?
2. **Scenario 2**: The professor rapidly flips through 10 slides in 5 seconds. How does your frame deduplication and queueing mechanism handle this burst without causing memory spikes?
3. **Scenario 3**: The user's system runs out of VRAM/RAM while Ollama is running `qwen2.5vl:3b`. How does the application detect this failure and gracefully degrade or fall back?
4. **Scenario 4**: The network drops between the Chrome extension and localhost backend for 30 seconds. How are pending frames and audio chunks buffered on the client side?
5. **Scenario 5**: A lecture slide contains low-contrast gray text on a dark background. Your MAE comparison reports no change. How would you adjust your vision algorithm to catch subtle text updates?
6. **Scenario 6**: Two students trigger `/generate-notes` for the same session at the exact same moment. How does your backend handle or prevent duplicate LLM calls?
7. **Scenario 7**: The generated lecture notes exceed the token context limit of the active instruction model. How would you implement a recursive map-reduce summarization strategy?
8. **Scenario 8**: A student's laptop battery dies mid-session. When they reboot, how can the extension or backend detect and restore the abandoned session?
9. **Scenario 9**: The LLM outputs malformed markdown with unclosed table tags and missing diagram brackets. How does `PdfGenerator.js` handle broken markdown without throwing uncaught rendering errors?
10. **Scenario 10**: The user triggers `/cleanup-session` while a background transcription task is still actively writing to the session folder. How do you resolve this race condition?

---

## 6. Critical Code Snippets to Master Whiteboard Reproduction

Candidates should be able to write the following 3 algorithms cleanly from memory:
1. **The MAE Image Comparison Function** (`compare_frames.py`).
2. **The Temporal Multimodal Alignment Algorithm** (`NoteGenerator.alignTimeline`).
3. **The In-Memory Cosine Similarity & Top-K Ranking Function** (`NotesController.ask`).

