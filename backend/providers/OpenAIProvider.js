const AIProvider = require("./AIProvider");

class OpenAIProvider extends AIProvider {
  async generateNotes(alignedTimeline) {
    throw new Error("OpenAIProvider is not yet implemented.");
  }
  async askQuestion(question, context) {
    throw new Error("OpenAIProvider is not yet implemented.");
  }
  async generateQuiz(notes) {
    throw new Error("OpenAIProvider is not yet implemented.");
  }
}

module.exports = OpenAIProvider;
