import struct
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse

from backend.core.rate_limiter import ModelOverloaded, QuotaExceeded
from backend.schemas import VoiceSpeakRequest
from backend.voice.stt import transcribe
from backend.voice.tts import speak

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


def _synthesize(text: str) -> bytes:
    """`speak()`, with quota/overload errors turned into HTTP errors the
    frontend can react to (it falls back to the browser's own speech)."""
    try:
        return speak(text)
    except QuotaExceeded as e:
        raise HTTPException(
            status_code=429,
            detail="Voice quota reached",
            headers={"Retry-After": str(round(e.retry_after))},
        ) from e
    except ModelOverloaded as e:
        raise HTTPException(status_code=503, detail="Voice model is busy") from e


@router.post("/speak")
def voice_speak(request: VoiceSpeakRequest):
    return Response(content=_synthesize(request.text), media_type="audio/wav")


def _frame(payload: bytes) -> bytes:
    """4-byte big-endian length prefix + payload -- lets the client tell where
    one sentence's WAV bytes end and the next one's begin in a single
    streamed HTTP body."""
    return struct.pack(">I", len(payload)) + payload


@router.post("/speak-stream")
def voice_speak_stream(request: VoiceSpeakRequest):
    """Same audio as /voice/speak, in the length-prefixed frame format the
    frontend's player consumes. It's a single frame now: the TTS quota is too
    small for one synthesis call per sentence (see backend/voice/tts.py). The
    synthesis happens before the response starts, so a quota error can still
    be returned as a proper 429 instead of a broken stream."""
    wav_bytes = _synthesize(request.text)

    return StreamingResponse(iter([_frame(wav_bytes)]), media_type="application/octet-stream")
