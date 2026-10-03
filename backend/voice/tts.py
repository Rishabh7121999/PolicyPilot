"""Text-to-speech with Kokoro (82M parameters, int8 ONNX on CPU) -- no API,
no quota. Synthesis runs about 0.6x real time on one core, so the answer is
streamed in chunks: the first is kept short (the opening clause) to start
playback quickly, and later chunks are synthesized while earlier ones play.

The model files are downloaded on first use into KOKORO_MODEL_DIR (default
.cache/kokoro); bake them into the image when deploying so a cold start
doesn't download ~120MB.
"""

import io
import logging
import os
import re
import threading
import wave
from collections.abc import Iterator
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import onnxruntime as rt
from kokoro_onnx import Kokoro

from backend.config import BASE_DIR

# Kokoro weights and voices are Apache 2.0. af_heart is the best-rated
# English voice; see VOICES.md in hexgrad/Kokoro-82M for the others
# (bf_* are British, hf_*/hm_* Hindi).
VOICE = "af_heart"
LANG = "en-us"
MODEL_FILE = "kokoro-v1.0.int8.onnx"
VOICES_FILE = "voices-v1.0.bin"
DOWNLOAD_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/{}"
MODEL_DIR = Path(os.getenv("KOKORO_MODEL_DIR", str(BASE_DIR / ".cache" / "kokoro")))

SAMPLE_RATE = 24000
# Kokoro trims the silence around each chunk, so the pause is added back.
SENTENCE_PAUSE_S = 0.25
CLAUSE_PAUSE_S = 0.1
# The first sentence is split at the first clause boundary that has at least
# this many words before it; one- or two-word chunks sound clipped.
MIN_CLAUSE_WORDS = 3

logger = logging.getLogger(__name__)

_kokoro: Kokoro | None = None
_kokoro_lock = threading.Lock()
# One ONNX session shared by every request; run them one at a time so two
# concurrent answers don't each get half a CPU.
_synth_lock = threading.Lock()


def _download(name: str) -> Path:
    path = MODEL_DIR / name
    if not path.exists():
        logger.info("Downloading Kokoro file %s to %s", name, MODEL_DIR)
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(path.suffix + ".part")
        with urlopen(DOWNLOAD_URL.format(name)) as response, open(partial, "wb") as f:
            while block := response.read(1 << 20):
                f.write(block)
        partial.rename(path)
    return path


def load_voice() -> Kokoro:
    global _kokoro

    with _kokoro_lock:
        if _kokoro is None:
            model_path, voices_path = _download(MODEL_FILE), _download(VOICES_FILE)
            options = rt.SessionOptions()
            # Extra threads barely help this model (2.7s -> 2.1s for a sentence
            # on 4 threads) and Cloud Run gives one vCPU anyway.
            options.intra_op_num_threads = 1
            options.inter_op_num_threads = 1
            session = rt.InferenceSession(str(model_path), options, providers=["CPUExecutionProvider"])
            _kokoro = Kokoro.from_session(session, str(voices_path))

    return _kokoro


_MARKDOWN = re.compile(r"[*_`#>|]+")
_BULLET = re.compile(r"^\s*(?:[-•]|\d+\.)\s+", re.MULTILINE)
_RUPEES = re.compile(
    r"(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d+)?)(\s*(?:lakhs?|crores?)\b)?", re.IGNORECASE
)
_NUMBER = re.compile(r"\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_CLAUSE_END = re.compile(r"(?<=[,;:])\s+")


def _speak_amount(raw: str) -> str:
    """'5,00,000' -> '5 lakh', '1,50,00,000' -> '1.5 crore', '5,000' -> '5000'.
    espeak reads Indian digit grouping as 'five zero zero thousand'."""
    value = float(raw.replace(",", ""))

    if value >= 1e7:
        return f"{value / 1e7:g} crore"
    if value >= 1e5:
        return f"{value / 1e5:g} lakh"
    return f"{value:g}"


def normalize_for_speech(text: str) -> str:
    """Make an answer read naturally: drop markdown, say rupee amounts the
    Indian way ('₹5,00,000' -> '5 lakh rupees')."""
    text = _BULLET.sub("", text)
    text = _MARKDOWN.sub("", text)
    text = _RUPEES.sub(
        lambda m: f"{m.group(1).replace(',', '')}{m.group(2)} rupees"
        if m.group(2)
        else f"{_speak_amount(m.group(1))} rupees",
        text,
    )
    text = _NUMBER.sub(lambda m: _speak_amount(m.group(0)), text)
    return re.sub(r"\s+", " ", text).strip()


def split_for_speech(text: str) -> list[tuple[str, float]]:
    """Split normalized text into (chunk, pause after) pairs: one per sentence,
    except that the first sentence's opening clause is its own chunk, since
    time to first audio is proportional to the first chunk's length."""
    sentences = [s for s in _SENTENCE_END.split(text) if s]
    if not sentences:
        return []

    chunks = []
    for boundary in _CLAUSE_END.finditer(sentences[0]):
        clause = sentences[0][: boundary.start()]
        if len(clause.split()) >= MIN_CLAUSE_WORDS:
            chunks.append((clause, CLAUSE_PAUSE_S))
            sentences[0] = sentences[0][boundary.end() :]
            break

    chunks += [(s, SENTENCE_PAUSE_S) for s in sentences]
    return chunks


def _synthesize(text: str, pause_s: float) -> np.ndarray:
    with _synth_lock:
        audio, _ = load_voice().create(text, voice=VOICE, lang=LANG)
    return np.concatenate([audio, np.zeros(int(pause_s * SAMPLE_RATE), dtype=audio.dtype)])


def _to_wav(audio: np.ndarray) -> bytes:
    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as wav:
        wav.setframerate(SAMPLE_RATE)
        wav.setsampwidth(2)
        wav.setnchannels(1)
        wav.writeframes((np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes())

    return buffer.getvalue()


def speak_stream(text: str) -> Iterator[bytes]:
    """Yield one WAV per chunk of `text`, each as soon as it's synthesized."""
    for chunk, pause_s in split_for_speech(normalize_for_speech(text)):
        yield _to_wav(_synthesize(chunk, pause_s))


def speak(text: str) -> bytes:
    """Synthesize the whole of `text` as a single WAV."""
    parts = [_synthesize(chunk, pause_s) for chunk, pause_s in split_for_speech(normalize_for_speech(text))]
    return _to_wav(np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32))
