const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const StorageManager = require("../utils/StorageManager");
const { Ollama } = require("ollama");
const config = require("../utils/config");

function customFetch(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    
    const reqOptions = {
      method: options.method || "GET",
      headers: options.body ? {
        ...options.headers,
        "Content-Length": Buffer.byteLength(options.body)
      } : options.headers,
      timeout: 600000 // 10 minutes
    };
    
    const req = client.request(url, reqOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: async () => body,
          json: async () => JSON.parse(body),
          headers: {
            get: (name) => res.headers[name.toLowerCase()]
          }
        });
      });
    });
    
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

const ollama = new Ollama({
  host: config.ollamaHost,
  fetch: customFetch
});

function getImageDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        format: "PNG"
      };
    }
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        const marker = buffer.readUInt16BE(offset);
        offset += 2;
        if (marker === 0xFFC0 || marker === 0xFFC2) {
          offset += 3;
          const height = buffer.readUInt16BE(offset);
          const width = buffer.readUInt16BE(offset + 2);
          return { width, height, format: "JPEG" };
        }
        const length = buffer.readUInt16BE(offset);
        offset += length;
      }
    }
  } catch (err) {
    console.error("Failed to parse image dimensions:", err);
  }
  return { width: null, height: null, format: "Unknown" };
}

class SlideExtractor {
  static compareFrames(framePath1, framePath2) {
    const scriptPath = path.join(__dirname, "..", "utils", "compare_frames.py");
    return new Promise((resolve) => {
      exec(`python3 "${scriptPath}" "${framePath1}" "${framePath2}"`, (err, stdout) => {
        if (err) {
          resolve(true); // default to different in case of error
          return;
        }
        resolve(stdout.trim() === "true");
      });
    });
  }

  static async processFrame(sessionId, fileName, absolutePath) {
    const metadata = StorageManager.readMetadata(sessionId);
    const uniqueSlides = metadata.uniqueSlides || [];
    
    const tsStr = fileName.replace("frame_", "").replace(".jpg", "");
    const absoluteTimestamp = parseInt(tsStr, 10);
    const relativeTimestamp = Math.max(0, Math.floor((absoluteTimestamp - metadata.startTime) / 1000));

    let isDifferent = false;
    let matchingSlide = null;
    
    if (uniqueSlides.length === 0) {
      isDifferent = true;
    } else {
      const lastSlide = uniqueSlides[uniqueSlides.length - 1];
      const lastSlidePath = path.join(StorageManager.getFramesDir(sessionId), lastSlide.slide);
      const isDifferentFromLast = await this.compareFrames(lastSlidePath, absolutePath);
      
      if (isDifferentFromLast) {
        isDifferent = true;
        // Optimization: check if this matches any of the last 4 unique slides
        const checkCount = Math.min(uniqueSlides.length, 5);
        for (let i = uniqueSlides.length - 2; i >= uniqueSlides.length - checkCount; i--) {
          const prevSlide = uniqueSlides[i];
          const prevSlidePath = path.join(StorageManager.getFramesDir(sessionId), prevSlide.slide);
          const isDiff = await this.compareFrames(prevSlidePath, absolutePath);
          if (!isDiff) {
            isDifferent = true;
            matchingSlide = prevSlide;
            console.log(`[SlideExtractor] Duplicate slide detected (matches ${prevSlide.slide}). Reusing slideContent to skip OCR.`);
            break;
          }
        }
      } else {
        isDifferent = false;
      }
    }

    if (isDifferent) {
      console.log(`[SlideExtractor] New slide detected: ${fileName} (+${relativeTimestamp}s)`);
      
      let slideContent = null;
      if (matchingSlide && matchingSlide.slideContent) {
        slideContent = matchingSlide.slideContent;
      }

      await StorageManager.updateMetadata(sessionId, (meta) => {
        meta.uniqueSlides.push({
          slide: fileName,
          timestamp: relativeTimestamp,
          slideContent: slideContent
        });
      });

      if (!slideContent) {
        // Run Local Qwen-VL OCR / information extraction in background
        this.extractSlideContentBackground(sessionId, fileName, absolutePath);
      }
    } else {
      console.log(`[SlideExtractor] Frame ${fileName} matches previous slide. Skipping extraction.`);
    }
  }

  static async extractSlideContent(sessionId, absolutePath) {
    console.log(`[SlideExtractor] Starting local Qwen-VL OCR for ${path.basename(absolutePath)}...`);
    const imageBase64 = fs.readFileSync(absolutePath).toString("base64");
    
    const response = await ollama.chat({
      model: config.visionModel,
      options: {
        num_ctx: 8192,
        temperature: 0
      },
      messages: [
        {
          role: "user",
          content: `Extract all visible content and analyze structural elements from this lecture slide screenshot. Do not explain, summarize, or add external knowledge. You must perform a purely factual visual extraction.

Return a JSON object in the EXACT format specified below, enclosed inside a \`\`\`json and \`\`\` code block:
\`\`\`json
{
  "title": "Slide Title (or null if not visible)",
  "visibleText": "General text that doesn't fit tables, equations, bullet points, or diagrams",
  "bullets": ["Bullet point 1", "Bullet point 2"],
  "equations": ["Equation 1 or mathematical derivation step"],
  "tables": [
    ["Row 1 Col 1", "Row 1 Col 2"],
    ["Row 2 Col 1", "Row 2 Col 2"]
  ],
  "detectedVisuals": {
    "flowchart": true/false,
    "blockDiagram": true/false,
    "architectureDiagram": true/false,
    "uml": true/false,
    "erDiagram": true/false,
    "graph": true/false,
    "table": true/false,
    "mathematicalDerivation": true/false
  },
  "diagrams": [
    {
      "type": "flowchart/block diagram/architecture diagram/UML/ER diagram/graph/other",
      "description": "Factual description of the diagram. List all visible components, labels, nodes, arrow direction connections, highlighted elements, and groupings. Do not explain the underlying concepts, just state what is visually represented."
    }
  ],
  "figures": [
    {
      "description": "Description of any photograph, illustration, or visual element other than a diagram or chart."
    }
  ],
  "charts": [
    {
      "type": "bar/line/pie/scatter/other",
      "description": "Description of the chart, including titles, axes labels, legends, and key data trends."
    }
  ]
}
\`\`\`

Do not include any conversational introduction or explanation outside the JSON code block.`
        }
      ],
      images: [imageBase64]
    });

    const extraction = response.message.content;

    let parsedContent;
    try {
      parsedContent = JSON.parse(extraction);
    } catch (e) {
      try {
        const cleaned = extraction.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedContent = JSON.parse(cleaned);
      } catch (err) {
        parsedContent = {
          title: "Slide Title Extraction Failed",
          visibleText: extraction,
          bullets: [],
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

    // Phase 7: Debug Mode Output
    if (config.debugMode) {
      try {
        const sessionDir = StorageManager.getSessionDir(sessionId);
        const dimensions = getImageDimensions(absolutePath);
        const debugReport = {
          frameName: path.basename(absolutePath),
          originalFramePath: absolutePath,
          processedFramePath: absolutePath,
          format: dimensions.format,
          resolution: `${dimensions.width}x${dimensions.height}`,
          fileSizeBytes: fs.statSync(absolutePath).size,
          base64SizeBytes: imageBase64.length,
          visionRequestMetadata: {
            model: config.visionModel,
            num_ctx: 8192,
            temperature: 0,
            promptLength: response.prompt_eval_count || null
          },
          rawVisionResponse: extraction,
          parsedJson: parsedContent
        };
        const debugFilePath = path.join(sessionDir, `debug_vision_${path.basename(absolutePath)}.json`);
        fs.writeFileSync(debugFilePath, JSON.stringify(debugReport, null, 2), "utf8");
        console.log(`[SlideExtractor] [DEBUG] Wrote raw vision response report to ${debugFilePath}`);
      } catch (err) {
        console.error(`[SlideExtractor] [DEBUG] Failed to write debug file:`, err);
      }
    }

    return parsedContent;
  }

  static async extractSlideContentBackground(sessionId, fileName, absolutePath) {
    try {
      const parsedContent = await this.extractSlideContent(sessionId, absolutePath);
      
      await StorageManager.updateMetadata(sessionId, (meta) => {
        const slideEntry = meta.uniqueSlides.find(s => s.slide === fileName);
        if (slideEntry) {
          slideEntry.slideContent = parsedContent;
        }
      });
      console.log(`[SlideExtractor] Finished local slide extraction for ${fileName}`);
    } catch (err) {
      console.error(`[SlideExtractor] Extraction failed for ${fileName}:`, err);
      await StorageManager.updateMetadata(sessionId, (meta) => {
        const slideEntry = meta.uniqueSlides.find(s => s.slide === fileName);
        if (slideEntry) {
          slideEntry.slideContent = {
            title: "Slide Extraction Error",
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
      });
    }
  }
}

module.exports = SlideExtractor;
