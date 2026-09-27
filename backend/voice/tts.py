import os
import re
from collections.abc import Iterator

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

TTS_MODEL = "gemini-3.8-flash-lite-tts"
VOICE_NAME = "Kore"

# Fragments shorter than this get merged into the next sentence instead of
# being sent to TTS on their own -- keeps voice mode from making a flurry of
# tiny synthesis calls for things like "Rs." or a lone list number.
MIN_SENTENCE_CHARS = 20

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

_client = None


def _get_client() -> genai.Client:
    global _client

    if _client is None:
        _client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    return _client


def speak(text: str) -> bytes:
    """Synthesize speech for `text` and return WAV audio bytes."""
    response = _get_client().models.generate_content(
        model=TTS_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE_NAME)
                )
            ),
        ),
    )

    return response.candidates[0].content.parts[0].inline_data.data


def split_sentences(text: str) -> list[str]:
    """Split into TTS-sized sentences, merging short fragments into their
    neighbor so voice mode doesn't synthesize a flood of tiny clips."""
    parts = [p.strip() for p in _SENTENCE_SPLIT_RE.split(text.strip()) if p.strip()]

    if not parts:
        return [text.strip()] if text.strip() else []

    merged: list[str] = []

    for part in parts:
        if merged and len(merged[-1]) < MIN_SENTENCE_CHARS:
            merged[-1] = f"{merged[-1]} {part}"
        else:
            merged.append(part)

    return merged


def speak_stream(text: str) -> Iterator[bytes]:
    """Yield WAV bytes one sentence at a time, synthesizing each sentence only
    as it's needed -- lets the caller start playing sentence 1 while sentence
    2 is still being synthesized, instead of waiting for the whole answer."""
    for sentence in split_sentences(text):
        yield speak(sentence)
