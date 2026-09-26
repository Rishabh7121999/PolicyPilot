import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

TTS_MODEL = "gemini-3.8-flash-lite-tts"
VOICE_NAME = "Kore"

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
