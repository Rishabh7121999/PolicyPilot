/**
 * Plays a sequence of audio blobs back-to-back as they arrive, so streamed
 * TTS sentences can start playing before later sentences have even finished
 * synthesizing. `stop()` interrupts playback immediately (used for
 * tap-to-interrupt in hands-free voice mode).
 */
export class AudioQueuePlayer {
  private queue: Blob[] = []
  private current: HTMLAudioElement | null = null
  private playing = false
  private stopped = false
  private usingBrowserSpeech = false
  private onDone?: () => void

  constructor(onDone?: () => void) {
    this.onDone = onDone
  }

  push(blob: Blob) {
    if (this.stopped) return
    this.queue.push(blob)
    if (!this.playing) this.playNext()
  }

  /** Call once no more chunks will arrive, so onDone can fire after the last one finishes. */
  end() {
    if (!this.playing && this.queue.length === 0) {
      this.onDone?.()
    }
  }

  private playNext() {
    if (this.stopped) return

    const blob = this.queue.shift()
    if (!blob) {
      this.playing = false
      return
    }

    this.playing = true
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    this.current = audio

    const advance = () => {
      URL.revokeObjectURL(url)
      if (this.current === audio) this.current = null
      if (this.queue.length > 0) {
        this.playNext()
      } else {
        this.playing = false
        this.onDone?.()
      }
    }

    audio.onended = advance
    audio.onerror = advance
    audio.play().catch(advance)
  }

  get isPlaying() {
    return this.playing
  }

  /**
   * Fallback for when server TTS is unavailable (e.g. its small daily quota
   * is spent): speak with the browser's built-in voice instead of staying
   * silent. Resolves once speech finishes or `stop()` is called.
   */
  speakWithBrowser(text: string): Promise<void> {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (this.stopped || !synth || !text.trim()) return Promise.resolve()

    this.playing = true
    this.usingBrowserSpeech = true

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      const finish = () => {
        this.usingBrowserSpeech = false
        this.playing = false
        resolve()
      }
      utterance.onend = finish
      utterance.onerror = finish
      synth.speak(utterance)
    })
  }

  stop() {
    this.stopped = true
    this.playing = false
    this.queue = []
    if (this.current) {
      this.current.pause()
      this.current = null
    }
    if (this.usingBrowserSpeech) {
      window.speechSynthesis.cancel()
    }
  }
}
