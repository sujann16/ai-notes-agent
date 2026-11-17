const config = require("../utils/config");
const GeminiProvider = require("./GeminiProvider");
const OllamaProvider = require("./OllamaProvider");
const OpenAIProvider = require("./OpenAIProvider");
const ClaudeProvider = require("./ClaudeProvider");
const GrokProvider = require("./GrokProvider");

function getAIProvider() {
  const provider = (config.aiProvider || "gemini").toLowerCase().trim();
  
  switch (provider) {
    case "gemini":
      return new GeminiProvider();
    case "ollama":
      return new OllamaProvider();
    case "openai":
      return new OpenAIProvider();
    case "claude":
      return new ClaudeProvider();
    case "grok":
      return new GrokProvider();
    default:
      console.warn(`Unknown AI provider "${provider}". Falling back to Gemini.`);
      return new GeminiProvider();
  }
}

module.exports = {
  getAIProvider
};
