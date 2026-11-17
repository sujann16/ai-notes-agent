/**
 * Abstract class representing the AI Provider interface.
 */
class AIProvider {
  /**
   * Generates lecture notes from aligned slide content and transcripts.
   * @param {Array} alignedTimeline - The aligned timeline array containing slide contents and transcripts.
   * @returns {Promise<string>} Generated notes in Markdown format.
   */
  async generateNotes(alignedTimeline) {
    throw new Error("generateNotes must be implemented by the provider");
  }

  /**
   * Performs RAG Q&A answering.
   * @param {string} question - The user question.
   * @param {string} context - Scored chunks context.
   * @returns {Promise<string>} Answer response.
   */
  async askQuestion(question, context) {
    throw new Error("askQuestion must be implemented by the provider");
  }

  /**
   * Generates multiple-choice quiz questions from note content.
   * @param {string} notes - The lecture notes.
   * @returns {Promise<string>} Quiz JSON string.
   */
  async generateQuiz(notes) {
    throw new Error("generateQuiz must be implemented by the provider");
  }
}

module.exports = AIProvider;
