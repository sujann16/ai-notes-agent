const SessionManager = require("../services/SessionManager");

class AudioController {
  static async uploadAudioChunk(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "Audio chunk missing" });
      }

      const sessionId = req.body.sessionId || "current";
      const chunkIndex = parseInt(req.body.chunkIndex, 10) || 0;
      const timestampOffset = parseFloat(req.body.timestamp) || 0;

      const result = await SessionManager.registerAndTranscribeChunk(
        sessionId,
        req.file.path,
        chunkIndex,
        timestampOffset
      );
      res.json(result);
    } catch (err) {
      console.error("[AudioController] Upload audio chunk error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = AudioController;
