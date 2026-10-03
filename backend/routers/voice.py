import struct
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response, StreamingResponse

from backend.schemas import VoiceSpeakRequest
from backend.voice.stt import transcribe
from backend.voice.tts import speak, speak_stream

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
    return Response(content=speak(request.text), media_type="audio/wav")


def _frame(payload: bytes) -> bytes:
    """4-byte big-endian length prefix + payload -- lets the client tell where
    one sentence's WAV bytes end and the next one's begin in a single
    streamed HTTP body."""
    return struct.pack(">I", len(payload)) + payload


@router.post("/speak-stream")
def voice_speak_stream(request: VoiceSpeakRequest):
    """One length-prefixed WAV frame per sentence, each sent as soon as it's
    synthesized, so playback starts after the first sentence rather than the
    whole answer."""
    return StreamingResponse(
        (_frame(wav) for wav in speak_stream(request.text)),
        media_type="application/octet-stream",
    )
