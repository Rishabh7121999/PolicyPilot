from dotenv import load_dotenv
import base64

load_dotenv()

import streamlit as st
from core.insurance_bot import ask_insurance_bot

from voice.stt import transcribe
from voice.tts import speak

from concurrent.futures import ThreadPoolExecutor

st.set_page_config(
    page_title="Insurance Voice Advisor",
    page_icon="🎙️",
    layout="wide"
)

st.title("🎙️ Insurance Voice Advisor")

# ---------------------------------
# Session State
# ---------------------------------

if "history" not in st.session_state:
    st.session_state.history = []

# ---------------------------------
# TEXT CHAT
# ---------------------------------

query = st.chat_input(
    "Ask about your insurance..."
)

if query:

    with st.spinner("Thinking..."):

        result = ask_insurance_bot(
            query,
            st.session_state.history
        )

    st.session_state.history.append(
        f"User: {query}"
    )

    st.session_state.history.append(
        f"Assistant: {result['answer']}"
    )

    st.subheader("Answer")

    st.write(result["answer"])

    st.subheader("Sources")

    for source in result["sources"]:
        st.write(f"• {source}")

import time

# ---------------------------------
# VOICE CHAT
# ---------------------------------

st.divider()

st.subheader("🎤 Voice Query")

audio = st.audio_input(
    "Record your question"
)

if audio:

    overall_start = time.time()

    audio_path = "temp.wav"

    with open(audio_path, "wb") as f:
        f.write(audio.getbuffer())

    # -----------------------
    # STT
    # -----------------------

    with st.spinner("Transcribing..."):

        stt_start = time.time()

        transcript = transcribe(
            audio_path
        )

        stt_time = round(
            time.time() - stt_start,
            2
        )

    st.subheader("Transcript")

    st.write(transcript)

    # -----------------------
    # RAG
    # -----------------------

    with st.spinner("Getting Answer..."):

        result = ask_insurance_bot(
            transcript,
            st.session_state.history
        )

    st.session_state.history.append(
        f"User: {transcript}"
    )

    st.session_state.history.append(
        f"Assistant: {result['answer']}"
    )

    st.subheader("Answer")

    st.write(result["answer"])

    st.subheader("Sources")

    for source in result["sources"]:
        st.write(f"• {source}")

    # -----------------------
    # TTS
    # -----------------------

    with st.spinner("Generating Voice Response..."):

        tts_start = time.time()

        response_audio = speak(
            result["answer"]
        )

        tts_time = round(
            time.time() - tts_start,
            2
        )

    st.subheader("Voice Response")

    st.audio(response_audio)


    # # Auto play
    # with open(response_audio, "rb") as audio_file:
    #     audio_bytes = audio_file.read()

    # audio_base64 = base64.b64encode(
    #     audio_bytes
    # ).decode()

    # audio_html = f"""
    # <audio autoplay>
    #     <source
    #         src="data:audio/mp3;base64,{audio_base64}"
    #         type="audio/mp3">
    # </audio>
    # """

    # st.markdown(
    #     audio_html,
    #     unsafe_allow_html=True
    # )

    # -----------------------
    # Metrics
    # -----------------------

    total_time = round(
        time.time() - overall_start,
        2
    )

    st.divider()

    st.subheader("⚡ Performance Metrics")

    timings = result["timings"]

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "STT",
            f"{stt_time}s"
        )

        st.metric(
            "Policy Detection & Query Rewrite",
            f"{timings['policy_detection_and_query_rewriting']}s"
        )

    # with col2:
    #     st.metric(
    #         "Query Rewrite",
    #         f"{timings['query_rewrite']}s"
    #     )

        st.metric(
            "Retrieval",
            f"{timings['retrieval']}s"
        )

    with col3:
        st.metric(
            "LLM Generation",
            f"{timings['llm_generation']}s"
        )

        st.metric(
            "TTS",
            f"{tts_time}s"
        )

    st.metric(
        "Total Response Time",
        f"{total_time}s"
    )

# ---------------------------------
# CHAT HISTORY
# ---------------------------------

st.divider()

with st.expander("Conversation History"):

    for message in st.session_state.history:

        st.write(message)