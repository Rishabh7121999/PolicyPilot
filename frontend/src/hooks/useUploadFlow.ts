import { useState, type DragEvent } from 'react'
import { uploadPolicy } from '../api/client'

export function useUploadFlow(onUploaded: () => void) {
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [progress, setProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startUpload(selected: File) {
    setFile(selected)
    setError(null)
    setSubmitting(true)
    setProgress(0)

    try {
      await uploadPolicy(selected, setProgress)
      setSubmitting(false)
      setProcessing(true)
      // Give the user a moment to see the "processing" state before resetting --
      // the actual status now lives on the policy detail/list pages, which poll.
      setTimeout(() => {
        onUploaded()
        setProcessing(false)
        setFile(null)
      }, 900)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(true)
  }

  function handleDragLeave() {
    setDragActive(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) startUpload(dropped)
  }

  return {
    file,
    dragActive,
    progress,
    submitting,
    processing,
    error,
    startUpload,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
