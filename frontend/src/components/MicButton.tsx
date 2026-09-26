import { useRef, useState } from 'react'

interface MicButtonProps {
  onRecorded: (blob: Blob) => void
  disabled?: boolean
}

export function MicButton({ onRecorded, disabled }: MicButtonProps) {
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
      stream.getTracks().forEach((track) => track.stop())
      onRecorded(blob)
    }

    recorder.start()
    mediaRecorderRef.current = recorder
    setRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={recording ? stopRecording : startRecording}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        recording
          ? 'bg-red-600 text-white animate-pulse'
          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
      }`}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
      title={recording ? 'Stop recording' : 'Record a voice message'}
    >
      {recording ? (
        <span className="h-3 w-3 rounded-sm bg-white" />
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.07A7 7 0 0 0 19 11Z" />
        </svg>
      )}
    </button>
  )
}
