const fs = require("fs");
const path = require("path");

let writeQueue = Promise.resolve();

class StorageManager {
  static getSessionDir(sessionId) {
    const safeSessionId = sessionId ? path.basename(sessionId) : "current";
    return path.join(__dirname, "..", "sessions", safeSessionId);
  }

  static getFramesDir(sessionId) {
    return path.join(this.getSessionDir(sessionId), "frames");
  }

  static getAudioDir(sessionId) {
    return path.join(this.getSessionDir(sessionId), "audio");
  }

  static initSession(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    const framesDir = this.getFramesDir(sessionId);
    const audioDir = this.getAudioDir(sessionId);
    
    // Clear existing session data for this specific session if it exists
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(framesDir, { recursive: true });
    fs.mkdirSync(audioDir, { recursive: true });

    const metadata = {
      startTime: Date.now(),
      uniqueSlides: [],
      transcriptSegments: []
    };
    
    this.writeMetadata(sessionId, metadata);
    return metadata;
  }

  static readMetadata(sessionId) {
    const metadataPath = path.join(this.getSessionDir(sessionId), "session_metadata.json");
    if (!fs.existsSync(metadataPath)) {
      return { startTime: Date.now(), uniqueSlides: [], transcriptSegments: [] };
    }
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  }

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

  static verifyNotesExist(sessionId) {
    const notesPath = path.join(this.getSessionDir(sessionId), "lecture-notes.md");
    return fs.existsSync(notesPath);
  }

  static verifyPdfExists(sessionId) {
    const pdfPath = path.join(this.getSessionDir(sessionId), "LectureNotes.pdf");
    return fs.existsSync(pdfPath);
  }

  static getNotesPath(sessionId) {
    return path.join(this.getSessionDir(sessionId), "lecture-notes.md");
  }

  static getPdfPath(sessionId) {
    return path.join(this.getSessionDir(sessionId), "LectureNotes.pdf");
  }

  static saveNotes(sessionId, notesContent) {
    const notesPath = this.getNotesPath(sessionId);
    fs.writeFileSync(notesPath, notesContent);
  }

  static finalizeAudio(sessionId) {
    const audioDir = this.getAudioDir(sessionId);
    const sessionDir = this.getSessionDir(sessionId);
    const lectureWebmPath = path.join(sessionDir, "lecture.webm");
    
    if (!fs.existsSync(audioDir)) {
      console.warn(`[StorageManager] Audio directory does not exist: ${audioDir}`);
      return;
    }
    
    const files = fs.readdirSync(audioDir)
      .filter(f => f.startsWith("chunk_") && f.endsWith(".webm"));
      
    if (files.length === 0) {
      console.warn(`[StorageManager] No audio chunks found in ${audioDir} to finalize.`);
      return;
    }
    
    files.sort((a, b) => {
      const idxA = parseInt(a.replace("chunk_", "").replace(".webm", ""), 10);
      const idxB = parseInt(b.replace("chunk_", "").replace(".webm", ""), 10);
      return idxA - idxB;
    });
    
    console.log(`[StorageManager] Concatenating ${files.length} WebM audio chunks into ${lectureWebmPath}...`);
    const writeStream = fs.createWriteStream(lectureWebmPath);
    for (const file of files) {
      const filePath = path.join(audioDir, file);
      const data = fs.readFileSync(filePath);
      writeStream.write(data);
    }
    writeStream.end();
    console.log(`[StorageManager] Finalized lecture.webm at ${lectureWebmPath}`);
  }
}

module.exports = StorageManager;
