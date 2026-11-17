const fs = require("fs");
const path = require("path");

// Load .env from backend root directory
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const configJsonPath = path.join(__dirname, "..", "config.json");

const defaultConfig = {
  visionModel: "qwen2.5vl:3b",
  instructionModel: "qwen3:4b",
  embeddingModel: "nomic-embed-text",
  ollamaHost: "http://127.0.0.1:11434",
  geminiModel: "gemini-2.5-flash",
  debugMode: false
};

let mergedConfig = { ...defaultConfig };

if (fs.existsSync(configJsonPath)) {
  try {
    const fileContent = fs.readFileSync(configJsonPath, "utf8");
    mergedConfig = { ...defaultConfig, ...JSON.parse(fileContent) };
  } catch (err) {
    console.error("Error reading config.json, using defaults:", err);
  }
}

const config = {
  aiProvider: process.env.AI_PROVIDER || "gemini",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || mergedConfig.geminiModel || "gemini-1.5-flash",
  visionModel: mergedConfig.visionModel,
  instructionModel: mergedConfig.instructionModel,
  embeddingModel: mergedConfig.embeddingModel,
  ollamaHost: process.env.OLLAMA_HOST || mergedConfig.ollamaHost,
  debugMode: process.env.DEBUG_MODE === "true" || !!mergedConfig.debugMode
};

module.exports = config;
