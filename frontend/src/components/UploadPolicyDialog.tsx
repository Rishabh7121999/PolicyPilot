import { useUploadFlow } from '../hooks/useUploadFlow'
import { UploadIcon } from './icons'

interface UploadPolicyDialogProps {
  onClose: () => void
  onUploaded: () => void
}

export function UploadPolicyDialog({ onClose, onUploaded }: UploadPolicyDialogProps) {
  const { file, dragActive, progress, submitting, processing, error, startUpload, handleDragOver, handleDragLeave, handleDrop } =
    useUploadFlow(onUploaded)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-neutral-900">Upload Policy</h2>
        <p className="mt-1 text-sm text-neutral-500">
          We'll read the document and figure out the policy type automatically.
        </p>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragActive
              ? 'border-sage-500 bg-sage-50'
              : 'border-beige-200'
          }`}
        >
          <UploadIcon className="h-8 w-8 text-sage-600" />
          <p className="mt-3 text-sm text-neutral-600">
            Drag and drop your policy PDF here, or
          </p>
          <label className="mt-2 cursor-pointer text-sm font-medium text-sage-700 hover:underline">
            browse to upload
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0]
                if (selected) startUpload(selected)
              }}
            />
          </label>
        </div>

        {file && (submitting || processing) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span className="truncate">{file.name}</span>
              <span>{submitting ? `${progress}%` : 'Processing…'}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-beige-200">
              <div
                className="h-full rounded-full bg-sage-600 transition-all"
                style={{ width: `${submitting ? progress : 100}%` }}
              />
            </div>
            {processing && (
              <p className="mt-2 text-sm text-sage-700">
                We're reading your document — you'll see it appear as "processing" in My Policies.
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-beige-100"
          >
            {processing ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
