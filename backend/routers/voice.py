import tempfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response

from backend.schemas import VoiceSpeakRequest
from voice.stt import transcribe
from voice.tts import speak

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/transcribe")
def voice_transcribe(file: UploadFile = File(...)):
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(file.file.read())

    try:
        transcript = transcribe(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return {"transcript": transcript}


@router.post("/speak")
def voice_speak(request: VoiceSpeakRequest):
    audio_bytes = speak(request.text)
    return Response(content=audio_bytes, media_type="audio/wav")
