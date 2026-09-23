from faster_whisper import WhisperModel

model = WhisperModel(
    "base",
    device="cpu"
)

def transcribe(audio_path):

    segments, _ = model.transcribe(
        audio_path
    )

    text = ""

    for segment in segments:
        text += segment.text

    return text