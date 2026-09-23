from urllib import response
from dotenv import load_dotenv
import os
load_dotenv()

from elevenlabs.client import ElevenLabs

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
client = ElevenLabs(
    api_key=ELEVENLABS_API_KEY
)

def speak(text):

    audio = client.text_to_speech.convert(
        voice_id="EXAVITQu4vr4xnSDxMaL",
        text=text
    )

    with open(
        "response.mp3",
        "wb"
    ) as f:

        for chunk in audio:
            f.write(chunk)

    return "response.mp3"