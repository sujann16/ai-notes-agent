const { transcribeAudio } = require("../utils/transcribe");
const StorageManager = require("../utils/StorageManager");

class SpeechTranscriber {
  static async transcribeChunk(sessionId, chunkPath, timestampOffset) {
    try {
      console.log(`[SpeechTranscriber] Starting Whisper transcription for ${chunkPath} (offset ${timestampOffset}s)...`);
      const segments = await transcribeAudio(chunkPath);
      console.log(`[SpeechTranscriber] Transcription complete. Received ${segments.length} segments.`);
      
      const adjustedSegments = segments.map(seg => ({
        start: seg.start + timestampOffset,
        end: seg.end + timestampOffset,
        text: seg.text
      }));

      await StorageManager.updateMetadata(sessionId, (meta) => {
        if (!meta.transcriptSegments) {
          meta.transcriptSegments = [];
        }
        meta.transcriptSegments.push(...adjustedSegments);
      });
      console.log(`[SpeechTranscriber] Appended ${adjustedSegments.length} segments to cumulative session transcript for ${sessionId}.`);
    } catch (err) {
      console.error(`[SpeechTranscriber] Whisper execution error on chunk ${chunkPath}:`, err);
    }
  }
}

module.exports = SpeechTranscriber;
