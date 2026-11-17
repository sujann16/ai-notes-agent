const express = require("express");
const multer = require("multer");
const fs = require("fs");
const StorageManager = require("../utils/StorageManager");

const SessionController = require("../controllers/SessionController");
const FrameController = require("../controllers/FrameController");
const AudioController = require("../controllers/AudioController");
const NotesController = require("../controllers/NotesController");

const router = express.Router();

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

module.exports = router;
