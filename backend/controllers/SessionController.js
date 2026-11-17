const SessionManager = require("../services/SessionManager");

class SessionController {
  static createSession(req, res) {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const result = SessionManager.createSession(sessionId);
      res.json({ ...result, sessionId });
    } catch (err) {
      console.error("[SessionController] Create session error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async stopSession(req, res) {
    try {
      const sessionId = req.body.sessionId || req.headers["x-session-id"] || "current";
      const result = await SessionManager.stopSession(sessionId);
      res.json(result);
    } catch (err) {
      console.error("[SessionController] Stop session error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static cleanupSession(req, res) {
    try {
      const sessionId = req.body.sessionId || req.headers["x-session-id"] || "current";
      const result = SessionManager.cleanupSession(sessionId);
      res.json(result);
    } catch (err) {
      console.error("[SessionController] Cleanup session error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = SessionController;
