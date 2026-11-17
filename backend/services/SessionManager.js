const fs = require("fs");
const path = require("path");
const StorageManager = require("../utils/StorageManager");
const SlideExtractor = require("./SlideExtractor");
const SpeechTranscriber = require("./SpeechTranscriber");
const NoteGenerator = require("./NoteGenerator");

class SessionManager {
  static createSession(sessionId) {
    const activeSessionId = sessionId || "current";
    console.log(`[SessionManager] Creating session: ${activeSessionId}`);
    const sessionDir = StorageManager.getSessionDir(activeSessionId);
    const metadataPath = path.join(sessionDir, "session_metadata.json");
    
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = StorageManager.readMetadata(activeSessionId);
        if (metadata.status === "Active") {
          throw new Error(`Session ${activeSessionId} is already active.`);
        }
        if (metadata.status === "Completed") {
          console.log(`[SessionManager] A completed session exists for ${activeSessionId}. Automatically cleaning up...`);
          this.cleanupSession(activeSessionId);
        }
      } catch (err) {
        console.error(`[SessionManager] Error reading existing metadata during creation for ${activeSessionId}:`, err);
      }
    }
    
    console.log(`[SessionManager] Initializing new session folders for ${activeSessionId}...`);
    const metadata = StorageManager.initSession(activeSessionId);
    metadata.status = "Active";
    StorageManager.writeMetadata(activeSessionId, metadata);
    
    return { success: true, startTime: metadata.startTime };
  }

  // startSession kept for backwards compatibility/alias
  static startSession(sessionId) {
    return this.createSession(sessionId);
  }

  static async stopSession(sessionId) {
    const activeSessionId = sessionId || "current";
    console.log(`[SessionManager] Stopping session: ${activeSessionId}`);
    const sessionDir = StorageManager.getSessionDir(activeSessionId);
    const metadataPath = path.join(sessionDir, "session_metadata.json");
    
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`No active session found for ID: ${activeSessionId}`);
    }
    
    const metadata = StorageManager.readMetadata(activeSessionId);
    if (metadata.status !== "Active") {
      throw new Error(`Session ${activeSessionId} is not active to stop.`);
    }
    
    // Finalize audio by concatenating chunks to lecture.webm
    StorageManager.finalizeAudio(activeSessionId);
    
    // Finalize transcript files if applicable
    if (metadata.transcriptSegments && metadata.transcriptSegments.length > 0) {
      const transcriptJsonPath = path.join(sessionDir, "transcript.json");
      fs.writeFileSync(transcriptJsonPath, JSON.stringify(metadata.transcriptSegments, null, 2));
      
      const transcriptTxtPath = path.join(sessionDir, "transcript.txt");
      const textLines = metadata.transcriptSegments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`);
      fs.writeFileSync(transcriptTxtPath, textLines.join("\n"));
      console.log(`[SessionManager] Saved transcript.json and transcript.txt for session: ${activeSessionId}`);
    }
    
    // Mark session as Completed
    metadata.status = "Completed";
    metadata.endTime = Date.now();
    StorageManager.writeMetadata(activeSessionId, metadata);
    
    return { success: true, message: `Session ${activeSessionId} stopped and completed` };
  }

  static async saveFrame(sessionId, imageBase64) {
    const activeSessionId = sessionId || "current";
    const framesDir = StorageManager.getFramesDir(activeSessionId);
    const fileName = `frame_${Date.now()}.jpg`;
    const filePath = path.join(framesDir, fileName);

    fs.writeFileSync(filePath, imageBase64, "base64");
    console.log(`[SessionManager] Saved frame image to: ${filePath}`);

    // Slide check and extraction in background
    SlideExtractor.processFrame(activeSessionId, fileName, filePath).catch(err => {
      console.error(`[SessionManager] Frame processing failed in background for ${activeSessionId}:`, err);
    });

    return { success: true, file: fileName };
  }

  static async registerAndTranscribeChunk(sessionId, filePath, chunkIndex, timestampOffset) {
    const activeSessionId = sessionId || "current";
    console.log(`[SessionManager] Received audio chunk ${chunkIndex} for session ${activeSessionId} at path: ${filePath}`);
    
    // Whisper transcribe in background
    SpeechTranscriber.transcribeChunk(activeSessionId, filePath, timestampOffset).catch(err => {
      console.error(`[SessionManager] Audio chunk transcription failed in background for ${activeSessionId}:`, err);
    });

    return { success: true, file: filePath };
  }

  static async generateNotes(sessionId) {
    const activeSessionId = sessionId || "current";
    console.log(`[SessionManager] Generating grounded session notes for ${activeSessionId}...`);
    const notes = await NoteGenerator.generate(activeSessionId);
    return { success: true, notes };
  }

  // alias for generateSessionNotes
  static async generateSessionNotes(sessionId) {
    return this.generateNotes(sessionId);
  }

  static downloadNotes(sessionId) {
    const activeSessionId = sessionId || "current";
    const notesPath = StorageManager.getNotesPath(activeSessionId);
    if (!fs.existsSync(notesPath)) {
      throw new Error(`Notes file not found for session: ${activeSessionId}`);
    }
    return notesPath;
  }

  static cleanupSession(sessionId) {
    const activeSessionId = sessionId || "current";
    console.log(`[SessionManager] Cleaning up session permanently: ${activeSessionId}`);
    const sessionDir = StorageManager.getSessionDir(activeSessionId);
    
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[SessionManager] Deleted session directory: ${sessionDir}`);
      } catch (err) {
        console.error(`[SessionManager] Failed to delete session directory ${sessionDir}:`, err);
      }
    } else {
      console.log(`[SessionManager] Session directory ${sessionDir} does not exist. Cleanup is idempotent.`);
    }
    
    // Clean up backend root files ONLY if this is the "current" session (for backward compatibility).
    // Shared concurrent sessions should never touch backend root files.
    if (activeSessionId === "current") {
      const rootFiles = ["lecture-notes.md", "chunks.json", "embeddings.json", "LectureNotes.pdf"];
      for (const file of rootFiles) {
        const filePath = path.join(__dirname, "..", file);
        if (fs.existsSync(filePath)) {
          try {
            fs.rmSync(filePath, { force: true });
            console.log(`[SessionManager] Deleted root file: ${filePath}`);
          } catch (e) {
            console.error(`[SessionManager] Failed to delete root file ${filePath}:`, e);
          }
        }
      }
    }
    
    return { success: true, message: `Session ${activeSessionId} cleaned successfully` };
  }
}

module.exports = SessionManager;
