import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

from backend.core.llm import CHARS_PER_TOKEN, translate_api_error
from backend.core.rate_limiter import acquire, record_usage

load_dotenv()

TTS_MODEL = "gemini-3.8-flash-lite-tts"
VOICE_NAME = "Kore"

# TTS quota is tiny (3 requests/min, 10/day on the free tier), so the whole
# answer is synthesized in ONE call -- per-sentence calls would spend a
# minute's quota on a single 3-sentence answer. Wait briefly for the minute
# window; past that, the caller should fall back (the frontend uses the
# browser's own speech synthesis).
MAX_WAIT_S = 10

_client = None


def _get_client() -> genai.Client:
    global _client

    if _client is None:
        _client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    return _client


def speak(text: str) -> bytes:
    """Synthesize speech for `text` and return WAV audio bytes.

    Raises QuotaExceeded when the TTS quota is spent (or would need a wait
    longer than MAX_WAIT_S), ModelOverloaded on a 503.
    """
    reservation = acquire(TTS_MODEL, len(text) // CHARS_PER_TOKEN + 1, MAX_WAIT_S)

    try:
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
    except Exception as e:
        raise translate_api_error(e, TTS_MODEL) from e

    usage = response.usage_metadata
    if usage is not None and usage.prompt_token_count is not None:
        # TTS quota counts input (text) tokens.
        record_usage(reservation, usage.prompt_token_count)

    return response.candidates[0].content.parts[0].inline_data.data
