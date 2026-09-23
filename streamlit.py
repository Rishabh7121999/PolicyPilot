import streamlit as st

audio = st.audio_input(
    "Ask about your insurance"
)

if audio:
    st.write("Audio received")