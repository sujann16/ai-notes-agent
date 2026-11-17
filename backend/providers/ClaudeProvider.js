const AIProvider = require("./AIProvider");

class ClaudeProvider extends AIProvider {
  async generateNotes(alignedTimeline) {
    throw new Error("ClaudeProvider is not yet implemented.");
  }
  async askQuestion(question, context) {
    throw new Error("ClaudeProvider is not yet implemented.");
  }
  async generateQuiz(notes) {
    throw new Error("ClaudeProvider is not yet implemented.");
  }
}

module.exports = ClaudeProvider;
