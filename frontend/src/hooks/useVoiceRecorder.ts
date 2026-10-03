import { useCallback, useRef, useState } from 'react'

const SILENCE_RMS_THRESHOLD = 12
// How long the user can pause (to think, mid-sentence) before the recording
// is sent. 1.4s cut people off between phrases.
const SILENCE_DURATION_MS = 2500
const MAX_RECORDING_MS = 30000
// Ignore sound in the first moments (the mic click, the end of the bot's audio).
const MIN_SPEECH_MS = 300
// Loud frames must add up to this much before it counts as speech, so a
// single cough or bump doesn't arm the silence timer.
const MIN_VOICED_MS = 250

interface UseVoiceRecorderOptions {
  onRecorded: (blob: Blob) => void
}

export function useVoiceRecorder({ onRecorded }: UseVoiceRecorderOptions) {
  const [recording, setRecording] = useState(false)
  const [hasSpoken, setHasSpoken] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastSpeechAtRef = useRef(0)
  const spokeRef = useRef(false)
  const startedAtRef = useRef(0)
  const lastFrameAtRef = useRef(0)
  const voicedMsRef = useRef(0)

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
  }, [])

  const monitor = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)

    let sumSquares = 0
    for (let i = 0; i < data.length; i++) {
      const centered = data[i] - 128
      sumSquares += centered * centered
    }
    const rms = Math.sqrt(sumSquares / data.length)
    const now = performance.now()
    const frameMs = now - lastFrameAtRef.current
    lastFrameAtRef.current = now

    if (rms > SILENCE_RMS_THRESHOLD) {
      lastSpeechAtRef.current = now
      if (!spokeRef.current && now - startedAtRef.current > MIN_SPEECH_MS) {
        voicedMsRef.current += frameMs
        if (voicedMsRef.current >= MIN_VOICED_MS) {
          spokeRef.current = true
          setHasSpoken(true)
        }
      }
    }

    if (spokeRef.current && now - lastSpeechAtRef.current > SILENCE_DURATION_MS) {
      stopRecording()
      return
    }

    if (now - startedAtRef.current > MAX_RECORDING_MS) {
      stopRecording()
      return
    }

    rafRef.current = requestAnimationFrame(monitor)
  }, [stopRecording])

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    audioCtxRef.current = audioCtx
    analyserRef.current = analyser

    const recorder = new MediaRecorder(stream)
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
      stream.getTracks().forEach((track) => track.stop())
      cleanupAudioGraph()
      setRecording(false)
      setHasSpoken(false)
      onRecorded(blob)
    }

    recorder.start()
    mediaRecorderRef.current = recorder

    spokeRef.current = false
    voicedMsRef.current = 0
    startedAtRef.current = performance.now()
    lastSpeechAtRef.current = performance.now()
    lastFrameAtRef.current = performance.now()
    setHasSpoken(false)
    setRecording(true)

    rafRef.current = requestAnimationFrame(monitor)
  }, [cleanupAudioGraph, monitor, onRecorded])

  return { recording, hasSpoken, startRecording, stopRecording }
}
