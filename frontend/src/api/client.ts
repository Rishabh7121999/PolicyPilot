import type {
  ChatRequest,
  ChatResponse,
  PolicyDetail,
  PolicyListItem,
  PolicyUploadResponse,
  VoiceTranscribeResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init)

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export function listPolicies(): Promise<PolicyListItem[]> {
  return request('/policies')
}

export function getPolicy(id: number): Promise<PolicyDetail> {
  return request(`/policies/${id}`)
}

export function uploadPolicy(file: File, policyType: string): Promise<PolicyUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('policy_type', policyType)

  return request('/policies/upload', { method: 'POST', body: form })
}

export function deletePolicy(id: number): Promise<void> {
  return request(`/policies/${id}`, { method: 'DELETE' })
}

export function sendChatMessage(body: ChatRequest): Promise<ChatResponse> {
  return request('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function transcribeAudio(blob: Blob): Promise<VoiceTranscribeResponse> {
  const form = new FormData()
  form.append('file', blob, 'recording.webm')

  return request('/voice/transcribe', { method: 'POST', body: form })
}

export async function speakText(text: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/voice/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }

  return res.blob()
}
