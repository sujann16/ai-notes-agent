class PromptBuilder {
  /**
   * Compiles the system instructions and user prompt for note generation.
   * Ensures high-quality pedagogical notes are generated.
   * @param {Array} alignedTimeline - Aligned timeline.
   * @returns {Object} { systemInstruction, prompt }
   */
  static buildNotePrompt(alignedTimeline) {
    const formattedSources = alignedTimeline.map((data, index) => {
      const bullets = Array.isArray(data.slideContent.bullets) && data.slideContent.bullets.length > 0
          ? data.slideContent.bullets.map(b => `- ${b}`).join("\n") : "None";
      const equations = Array.isArray(data.slideContent.equations) && data.slideContent.equations.length > 0
          ? data.slideContent.equations.map(e => `- ${e}`).join("\n") : "None";
      
      let tablesStr = "None";
      if (Array.isArray(data.slideContent.tables) && data.slideContent.tables.length > 0) {
        tablesStr = data.slideContent.tables.map(row => {
          if (Array.isArray(row)) {
            return "| " + row.join(" | ") + " |";
          }
          return row;
        }).join("\n");
      }
      
      const detected = [];
      if (data.slideContent.detectedVisuals) {
        for (const [key, value] of Object.entries(data.slideContent.detectedVisuals)) {
          if (value) detected.push(key);
        }
      }
      const detectedVisualsStr = detected.length > 0 ? detected.join(", ") : "None";
      
      let diagramsStr = "None";
      if (Array.isArray(data.slideContent.diagrams) && data.slideContent.diagrams.length > 0) {
        diagramsStr = data.slideContent.diagrams.map((d, idx) => `Diagram #${idx + 1} (${d.type || "unknown type"}):\n- Factual description: ${d.description || "None"}`).join("\n");
      }

      let figuresStr = "None";
      if (Array.isArray(data.slideContent.figures) && data.slideContent.figures.length > 0) {
        figuresStr = data.slideContent.figures.map((f, idx) => `Figure #${idx + 1}:\n- Description: ${f.description}`).join("\n");
      }

      let chartsStr = "None";
      if (Array.isArray(data.slideContent.charts) && data.slideContent.charts.length > 0) {
        chartsStr = data.slideContent.charts.map((c, idx) => `Chart #${idx + 1} (${c.type || "unknown type"}):\n- Description: ${c.description}`).join("\n");
      }

      const slideText = `
Slide Title: ${data.slideContent.title || "Untitled Slide"}
Bullet Points:
${bullets}
Equations:
${equations}
Tables:
${tablesStr}
Detected Visual Elements: ${detectedVisualsStr}
Diagram Descriptions:
${diagramsStr}
Figure Descriptions:
${figuresStr}
Chart Descriptions:
${chartsStr}
Visible Text: ${data.slideContent.visibleText || "None"}`;

      const spokenText = data.transcriptSegments && data.transcriptSegments.length > 0 
          ? data.transcriptSegments.join(" ") 
          : "(No transcript for this slide)";

      return `
=== Topic/Slide #${index + 1} ===
Relative Timestamp: ${data.timestamp}s
Slide Image File: ${data.slide}
[SLIDE CONTENT]
${slideText}
[LECTURER TRANSCRIPT]
${spokenText}
`;
    }).join("\n\n");

    const systemInstruction = `You are a student taking clear, highly factual notes while attending an academic lecture.
Your task is to write clean, natural, and strictly grounded lecture notes based ONLY on the provided sources (Slide Content and Lecturer Transcript).

Strict Grounding Rules:
- Do NOT use any external knowledge. If a topic is not explicitly mentioned or clearly visible in the slides/transcript, it must NOT appear in the notes.
- Do NOT make AI-generated assumptions or textbook-style expansions.
- Do NOT complete partially visible concepts or add examples/definitions that were not discussed.
- Every statement must be traceable directly to the provided sources.
- Avoid noisy OCR artifacts or unrelated transcript fragments. If uncertain about a detail, omit it entirely instead of guessing.
- Avoid generic filler or AI-like preamble. Write naturally like a student attending the class.
- Merge the slide content and lecturer transcript into a unified chronological explanation of each topic.
- Integrate explanations of visual diagrams and flowcharts directly into the topic explanations. Explain arrow flows and component relationships factually based ONLY on the provided diagram descriptions and what the lecturer spoke.
- Whenever a slide contains a diagram, you MUST include the exact tag \`[DIAGRAM: <filename>]\` (where <filename> is the exact value of the Slide Image File field, e.g. \`frame_1719323891000.jpg\`) on a new line immediately below the topic sub-heading \`### Topic: [Topic Name]\` in the Detailed Explanation section. Do not output a diagram tag if no diagram is present on the slide.`;

    const prompt = `Lecture Data:
${formattedSources}

Synthesize the lecture data and generate notes in the following Markdown format. Do NOT add any extra sections, glossary, reference list, review questions, or key takeaways. Include ONLY these sections:

# [Lecture Title]

## Topics Covered

[A bullet list of all main topics discussed during the lecture.]

---

## Detailed Explanation

[Explain each topic in the order it appeared in the lecture. Merge slide details, equations, diagrams, and transcripts into a unified, student-style explanation. Use proper sub-headings for each topic, formatted exactly as:

### Topic: [Topic Name]
[DIAGRAM: Slide Image File] (Include this line ONLY if a diagram is detected on this slide, replacing with the exact file name. Otherwise, omit it.)

[Your detailed, grounded explanation here. Do not repeat information. Explain any diagrams naturally within the topic explanation instead of creating a separate section.]
]

---

## Definitions

[Include ONLY definitions that were explicitly explained in the transcript or clearly visible in the slides. Do not invent or add textbook definitions that were not discussed. Format as a bulleted list.]`;

    return {
      systemInstruction,
      prompt
    };
  }
}

module.exports = PromptBuilder;
