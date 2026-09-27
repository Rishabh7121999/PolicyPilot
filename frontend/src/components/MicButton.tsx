interface MicButtonProps {
  recording: boolean
  hasSpoken: boolean
  onStart: () => void
  onStop: () => void
  disabled?: boolean
  // True while the assistant's spoken answer is still playing. Tapping the
  // mic in this state interrupts playback and starts recording right away,
  // instead of requiring a separate stop action first.
  speaking?: boolean
  onInterrupt?: () => void
}

export function MicButton({
  recording,
  hasSpoken,
  onStart,
  onStop,
  disabled,
  speaking,
  onInterrupt,
}: MicButtonProps) {
  function handleClick() {
    if (recording) {
      onStop()
      return
    }

    if (speaking) onInterrupt?.()
    onStart()
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        recording
          ? hasSpoken
            ? 'bg-red-600 text-white animate-pulse'
            : 'bg-red-400 text-white'
          : speaking
            ? 'bg-sage-200 text-sage-800 animate-pulse'
            : 'bg-beige-100 text-neutral-700 hover:bg-beige-200'
      }`}
      aria-label={recording ? 'Stop recording' : speaking ? 'Interrupt and speak' : 'Start recording'}
      title={
        recording
          ? 'Listening — stops automatically after you pause, or tap to stop now'
          : speaking
            ? 'Tap to interrupt and speak'
            : 'Record a voice message'
      }
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
