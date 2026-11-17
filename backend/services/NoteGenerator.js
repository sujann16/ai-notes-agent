const fs = require("fs");
const path = require("path");
const StorageManager = require("../utils/StorageManager");
const PdfGenerator = require("./PdfGenerator");
const { getAIProvider } = require("../providers");
const { Ollama } = require("ollama");
const config = require("../utils/config");
const PromptBuilder = require("../utils/PromptBuilder");
const SlideExtractor = require("./SlideExtractor");

const ollama = new Ollama({
  host: config.ollamaHost
});

class NoteGenerator {
  static alignTimeline(uniqueSlides, transcriptSegments) {
    const sortedSlides = [...uniqueSlides].sort((a, b) => a.timestamp - b.timestamp);
    const alignment = sortedSlides.map((slide, idx) => {
      const nextSlide = sortedSlides[idx + 1];
      const startTime = slide.timestamp;
      const endTime = nextSlide ? nextSlide.timestamp : Infinity;
      
      return {
        slide: slide.slide,
        timestamp: slide.timestamp,
        startTime,
        endTime,
        slideContent: slide.slideContent,
        transcriptSegments: []
      };
    });
    
    transcriptSegments.forEach(segment => {
      const segmentStart = segment.start;
      let activeSlide = alignment[0];
      for (let i = 0; i < alignment.length; i++) {
        if (segmentStart >= alignment[i].startTime && segmentStart < alignment[i].endTime) {
          activeSlide = alignment[i];
          break;
        }
      }
      if (activeSlide) {
        activeSlide.transcriptSegments.push(segment.text);
      }
    });
    
    return alignment;
  }

  static async generate(sessionId) {
    const activeSessionId = sessionId || "current";
    const metadata = StorageManager.readMetadata(activeSessionId);
    
    console.log(`[NoteGenerator] Resolving pending slide content extractions for session ${activeSessionId}...`);
    // SlideExtractor fallback resolution
    for (let slide of metadata.uniqueSlides) {
      if (slide.slideContent === null) {
        console.log(`[NoteGenerator] Running local extraction fallback for ${slide.slide}`);
        const absolutePath = path.join(StorageManager.getFramesDir(activeSessionId), slide.slide);
        try {
          slide.slideContent = await SlideExtractor.extractSlideContent(activeSessionId, absolutePath);
        } catch (err) {
          console.error(`[NoteGenerator] Fallback extraction failed for ${slide.slide}:`, err);
          slide.slideContent = {
            title: "Extraction Error",
            visibleText: "",
            bullets: [err.message],
            equations: [],
            tables: [],
            detectedVisuals: {
              flowchart: false,
              blockDiagram: false,
              architectureDiagram: false,
              uml: false,
              erDiagram: false,
              graph: false,
              table: false,
              mathematicalDerivation: false
            },
            diagrams: [],
            figures: [],
            charts: []
          };
        }
      }
    }
    
    StorageManager.writeMetadata(activeSessionId, metadata);

    console.log("[NoteGenerator] Aligning timeline...");
    const alignedTimeline = this.alignTimeline(metadata.uniqueSlides, metadata.transcriptSegments);

    // Phase 7: Debug Mode - save aligned timeline
    if (config.debugMode) {
      try {
        const debugTimelinePath = path.join(StorageManager.getSessionDir(activeSessionId), "debug_aligned_timeline.json");
        fs.writeFileSync(debugTimelinePath, JSON.stringify(alignedTimeline, null, 2), "utf8");
        console.log(`[NoteGenerator] [DEBUG] Wrote aligned timeline to ${debugTimelinePath}`);
      } catch (err) {
        console.error("[NoteGenerator] [DEBUG] Failed to write debug aligned timeline:", err);
      }
    }

    // Phase 7: Debug Mode - save final prompt compiled
    const { systemInstruction, prompt } = PromptBuilder.buildNotePrompt(alignedTimeline);
    if (config.debugMode) {
      try {
        const debugPromptPath = path.join(StorageManager.getSessionDir(activeSessionId), "debug_final_prompt.txt");
        const promptContent = `=== SYSTEM INSTRUCTION ===\n${systemInstruction}\n\n=== USER PROMPT ===\n${prompt}`;
        fs.writeFileSync(debugPromptPath, promptContent, "utf8");
        console.log(`[NoteGenerator] [DEBUG] Wrote compiled prompt to ${debugPromptPath}`);
      } catch (err) {
        console.error("[NoteGenerator] [DEBUG] Failed to write debug final prompt:", err);
      }
    }

    const provider = getAIProvider();
    console.log(`[NoteGenerator] Instantiating AI Provider: ${provider.constructor.name}`);
    const notes = await provider.generateNotes(alignedTimeline);
    console.log("[NoteGenerator] Notes generated successfully.");

    // Phase 7: Debug Mode - save LLM raw response
    if (config.debugMode) {
      try {
        const debugResponsePath = path.join(StorageManager.getSessionDir(activeSessionId), "debug_llm_response.txt");
        fs.writeFileSync(debugResponsePath, notes, "utf8");
        console.log(`[NoteGenerator] [DEBUG] Wrote LLM response to ${debugResponsePath}`);
      } catch (err) {
        console.error("[NoteGenerator] [DEBUG] Failed to write debug LLM response:", err);
      }
    }

    StorageManager.saveNotes(activeSessionId, notes);

    console.log("[NoteGenerator] Generating PDF representation...");
    await PdfGenerator.generate(activeSessionId, notes);

    console.log("[NoteGenerator] Generating RAG chunks and local embeddings...");
    await this.chunkAndEmbed(activeSessionId, notes);

    return notes;
  }

  static async chunkAndEmbed(sessionId, notes) {
    const sessionDir = StorageManager.getSessionDir(sessionId);
    
    const chunks = notes
      .split("\n\n")
      .filter(chunk => chunk.trim().length > 30)
      .map((text, index) => ({
        id: index + 1,
        text
      }));

    fs.writeFileSync(
      path.join(sessionDir, "chunks.json"),
      JSON.stringify(chunks, null, 2)
    );

    const embeddings = [];
    for (const chunk of chunks) {
      try {
        const response = await ollama.embed({
          model: config.embeddingModel,
          input: chunk.text
        });
        embeddings.push({
          id: chunk.id,
          text: chunk.text,
          embedding: response.embeddings[0]
        });
      } catch (err) {
        console.error(`[NoteGenerator] Failed to embed chunk ${chunk.id}:`, err);
      }
    }

    fs.writeFileSync(
      path.join(sessionDir, "embeddings.json"),
      JSON.stringify(embeddings, null, 2)
    );

    console.log("[NoteGenerator] Chunking and local embeddings completed.");
  }
}

module.exports = NoteGenerator;
