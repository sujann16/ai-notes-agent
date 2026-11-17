const SessionManager = require("../services/SessionManager");

class FrameController {
  static async saveFrame(req, res) {
    try {
      const { sessionId, image } = req.body;
      if (!image) {
        return res.status(400).json({ success: false, error: "Image data missing" });
      }
      const result = await SessionManager.saveFrame(sessionId || "current", image);
      res.json(result);
    } catch (err) {
      console.error("[FrameController] Save frame error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = FrameController;
