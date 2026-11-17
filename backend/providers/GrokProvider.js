const AIProvider = require("./AIProvider");

class GrokProvider extends AIProvider {
  async generateNotes(alignedTimeline) {
    throw new Error("GrokProvider is not yet implemented.");
  }
  async askQuestion(question, context) {
    throw new Error("GrokProvider is not yet implemented.");
  }
  async generateQuiz(notes) {
    throw new Error("GrokProvider is not yet implemented.");
  }
}

module.exports = GrokProvider;
