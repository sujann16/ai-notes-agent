import json
from faster_whisper import WhisperModel
import sys

audio_file = sys.argv[1]

model = WhisperModel(
    "base",
    device="cpu",
    compute_type="int8"
)

segments, info = model.transcribe(audio_file)

result_segments = []
for segment in segments:
    result_segments.append({
        "start": segment.start,
        "end": segment.end,
        "text": segment.text.strip()
    })

print(json.dumps(result_segments))
