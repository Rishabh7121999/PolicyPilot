import { useCallback, useRef, useState } from 'react'

const SILENCE_RMS_THRESHOLD = 12
const SILENCE_DURATION_MS = 1400
const MAX_RECORDING_MS = 30000
const MIN_SPEECH_MS = 300

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

    if (rms > SILENCE_RMS_THRESHOLD) {
      lastSpeechAtRef.current = now
      if (!spokeRef.current && now - startedAtRef.current > MIN_SPEECH_MS) {
        spokeRef.current = true
        setHasSpoken(true)
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
    startedAtRef.current = performance.now()
    lastSpeechAtRef.current = performance.now()
    setHasSpoken(false)
    setRecording(true)

    rafRef.current = requestAnimationFrame(monitor)
  }, [cleanupAudioGraph, monitor, onRecorded])

  return { recording, hasSpoken, startRecording, stopRecording }
}
