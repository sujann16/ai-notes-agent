const { Ollama } = require("ollama");
const AIProvider = require("./AIProvider");
const config = require("../utils/config");
const PromptBuilder = require("../utils/PromptBuilder");

class OllamaProvider extends AIProvider {
  constructor() {
    super();
    this.ollama = new Ollama({
      host: config.ollamaHost
    });
  }

  async generateNotes(alignedTimeline) {
    const { systemInstruction, prompt } = PromptBuilder.buildNotePrompt(alignedTimeline);
    const response = await this.ollama.chat({
      model: config.instructionModel,
      options: {
        num_ctx: 8192
      },
      messages: [
        {
          role: "system",
          content: systemInstruction
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    return response.message.content;
  }

  async askQuestion(question, context) {
    const response = await this.ollama.chat({
      model: config.instructionModel,
      messages: [
        {
          role: "user",
          content: `Answer ONLY using the context below.\n\nContext:\n${context}\n\nQuestion:\n${question}`
        }
      ]
    });
    return response.message.content;
  }

  async generateQuiz(notes) {
    const response = await this.ollama.chat({
      model: config.instructionModel,
      options: {
        num_ctx: 2048
      },
      messages: [
        {
          role: "user",
          content: `Generate exactly 5 multiple choice questions.\n\nIMPORTANT:\nReturn ONLY valid JSON.\nDo not include explanations.\nDo not include markdown.\nDo not include notes.\n\nReturn in this format:\n{\n  "questions": [\n    {\n      "question": "...",\n      "options": [\n        "...",\n        "...",\n        "...",\n        "..."\n      ],\n      "answer": "..."\n    }\n  ]\n}\n\nNotes:\n${notes}`
        }
      ]
    });
    return response.message.content;
  }
}

module.exports = OllamaProvider;
