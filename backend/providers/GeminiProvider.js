const { GoogleGenerativeAI } = require("@google/generative-ai");
const AIProvider = require("./AIProvider");
const config = require("../utils/config");
const PromptBuilder = require("../utils/PromptBuilder");

class GeminiProvider extends AIProvider {
  constructor() {
    super();
    if (!config.geminiApiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not defined in the environment. Gemini API calls will fail.");
    }
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }

  async generateNotes(alignedTimeline) {
    const { systemInstruction, prompt } = PromptBuilder.buildNotePrompt(alignedTimeline);
    const model = this.genAI.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: systemInstruction
    });
    
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async askQuestion(question, context) {
    const model = this.genAI.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: "Answer the question ONLY using the provided context. If the answer cannot be found in the context, respond stating that the information is not present. Do not use external knowledge."
    });

    const prompt = `Context:\n${context}\n\nQuestion:\n${question}`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async generateQuiz(notes) {
    const model = this.genAI.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: "Generate exactly 5 multiple choice questions. Return ONLY valid JSON in the requested format. Do not include markdown wraps (like ```json), explanations, or notes."
    });

    const prompt = `Notes:\n${notes}\n\nReturn in this format:\n{\n  "questions": [\n    {\n      "question": "...",\n      "options": [\n        "...",\n        "...",\n        "...",\n        "..."\n      ],\n      "answer": "..."\n    }\n  ]\n}`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}

module.exports = GeminiProvider;
