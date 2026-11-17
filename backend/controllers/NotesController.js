const fs = require("fs");
const path = require("path");
const SessionManager = require("../services/SessionManager");
const StorageManager = require("../utils/StorageManager");
const { getAIProvider } = require("../providers");

class NotesController {
  static async generateNotes(req, res) {
    try {
      const sessionId = req.body.sessionId || req.headers["x-session-id"] || "current";
      const result = await SessionManager.generateSessionNotes(sessionId);
      res.json(result);
    } catch (err) {
      console.error("[NotesController] Generate notes error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static downloadPDF(req, res) {
    try {
      const sessionId = req.query.sessionId || "current";
      const notesExist = StorageManager.verifyNotesExist(sessionId);
      const pdfExists = StorageManager.verifyPdfExists(sessionId);

      if (!notesExist || !pdfExists) {
        console.warn(`[NotesController] PDF download failed: notes.md or notes.pdf not found for session: ${sessionId}`);
        return res.status(404).json({
          success: false,
          error: "Notes not found"
        });
      }

      const pdfPath = StorageManager.getPdfPath(sessionId);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=LectureNotes.pdf");

      res.sendFile(pdfPath);
    } catch (err) {
      console.error("[NotesController] PDF download error:", err);
      res.status(500).json({ success: false, error: "Internal server error during PDF download" });
    }
  }

  static async ask(req, res) {
    try {
      const { question, sessionId } = req.body;
      if (!question) {
        return res.status(400).json({ success: false, error: "Question missing" });
      }

      const activeSessionId = sessionId || "current";
      let embeddingsPath = path.join(StorageManager.getSessionDir(activeSessionId), "embeddings.json");
      if (!fs.existsSync(embeddingsPath)) {
        embeddingsPath = path.join(__dirname, "..", "embeddings.json");
      }

      if (!fs.existsSync(embeddingsPath)) {
        return res.status(404).json({ success: false, error: "No embeddings found. Please generate notes first." });
      }

      const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, "utf8"));
      const ollamaHost = require("../utils/config").ollamaHost;
      const embeddingModel = require("../utils/config").embeddingModel;
      
      const { Ollama } = require("ollama");
      const ollama = new Ollama({ host: ollamaHost });
      
      // Calculate query embedding locally
      const response = await ollama.embed({
        model: embeddingModel,
        input: question
      });
      const queryVector = response.embeddings[0];

      const scored = embeddings.map(chunk => ({
        ...chunk,
        score: cosineSimilarity(queryVector, chunk.embedding)
      }));

      scored.sort((a, b) => b.score - a.score);
      const topChunks = scored.slice(0, 3);
      const context = topChunks.map(c => c.text).join("\n\n");

      // Query active provider (Gemini or Ollama)
      const provider = getAIProvider();
      const answer = await provider.askQuestion(question, context);

      res.json({
        success: true,
        answer
      });
    } catch (err) {
      console.error("[NotesController] Ask Q&A error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async generateQuiz(req, res) {
    try {
      const sessionId = req.body.sessionId || req.query.sessionId || "current";
      let notesPath = StorageManager.getNotesPath(sessionId);
      if (!fs.existsSync(notesPath)) {
        notesPath = path.join(__dirname, "..", "lecture-notes.md");
      }

      if (!fs.existsSync(notesPath)) {
        return res.status(404).json({ success: false, error: "Notes not found. Please generate notes first." });
      }

      const notes = fs.readFileSync(notesPath, "utf8").slice(0, 3000);
      const provider = getAIProvider();
      const quiz = await provider.generateQuiz(notes);

      let parsedQuiz;
      try {
        const cleaned = quiz.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedQuiz = JSON.parse(cleaned);
      } catch (e) {
        parsedQuiz = { raw: quiz };
      }

      res.json({
        success: true,
        quiz: parsedQuiz
      });
    } catch (err) {
      console.error("[NotesController] Generate quiz error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static notes(req, res) {
    const sessionId = req.query.sessionId || "current";
    let notesPath = StorageManager.getNotesPath(sessionId);
    if (!fs.existsSync(notesPath)) {
      notesPath = path.join(__dirname, "..", "lecture-notes.md");
    }

    if (!fs.existsSync(notesPath)) {
      return res.status(404).json({ success: false, error: "Notes file not found" });
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", "attachment; filename=lecture-notes.md");

    res.sendFile(notesPath);
  }
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = NotesController;
