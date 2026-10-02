import type {
  AuthResponse,
  ChatRequest,
  ChatSessionDetail,
  ChatSessionListItem,
  ChatStreamEvent,
  LoginRequest,
  PasswordChangeRequest,
  PolicyDetail,
  PolicyListItem,
  PolicyUploadResponse,
  ProfileUpdateRequest,
  SessionChatStreamEvent,
  SignupRequest,
  User,
  VoiceTranscribeResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const TOKEN_KEY = 'policypilot_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // ignore (e.g. private browsing storage restrictions)
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  })

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.()
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

export function uploadPolicy(file: File, onProgress?: (pct: number) => void): Promise<PolicyUploadResponse> {
  const form = new FormData()
  form.append('file', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/policies/upload`)

    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        if (xhr.status === 401) onUnauthorized?.()
        reject(new Error(`${xhr.status} ${xhr.statusText}: ${xhr.responseText}`))
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))

    xhr.send(form)
  })
}

export function updatePolicyType(id: number, policyType: string): Promise<PolicyDetail> {
  return request(`/policies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy_type: policyType }),
  })
}

// The file endpoint requires the bearer token, which a plain <a href> or
// window.open navigation can't send -- so fetch it as a blob instead and hand
// callers an object URL (or trigger the download from one).
export async function fetchPolicyFile(id: number): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/policies/${id}/file`, { headers: authHeaders() })

  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.()
    throw new Error(`${res.status} ${res.statusText}`)
  }

  return res.blob()
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadPolicyFile(id: number, filename: string): Promise<void> {
  saveBlob(await fetchPolicyFile(id), filename)
}

export function deletePolicy(id: number): Promise<void> {
  return request(`/policies/${id}`, { method: 'DELETE' })
}

/**
 * Reads a newline-delimited-JSON `StreamingResponse` body, parsing and
 * dispatching each complete line to `onEvent` as it arrives.
 */
async function streamNdjson(
  path: string,
  body: unknown,
  onEvent: (event: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    if (res.status === 401) onUnauthorized?.()
    const text = res.body ? await res.text() : ''
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })

    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim()) onEvent(JSON.parse(line))
    }

    if (done) break
  }

  if (buffer.trim()) onEvent(JSON.parse(buffer))
}

export function sendChatMessage(
  body: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamNdjson('/chat', body, onEvent as (event: unknown) => void, signal)
}

export async function transcribeAudio(blob: Blob): Promise<VoiceTranscribeResponse> {
  const form = new FormData()
  form.append('file', blob, 'recording.webm')

  return request('/voice/transcribe', { method: 'POST', body: form })
}

export function listChatSessions(): Promise<ChatSessionListItem[]> {
  return request('/chat/sessions')
}

export function createChatSession(policyId: number | null = null): Promise<ChatSessionListItem> {
  return request('/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy_id: policyId }),
  })
}

export function getChatSession(id: number): Promise<ChatSessionDetail> {
  return request(`/chat/sessions/${id}`)
}

export function deleteChatSession(id: number): Promise<void> {
  return request(`/chat/sessions/${id}`, { method: 'DELETE' })
}

export function signup(body: SignupRequest): Promise<AuthResponse> {
  return request('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function login(body: LoginRequest): Promise<AuthResponse> {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function logout(): void {
  clearToken()
}

export function getCurrentUser(): Promise<User> {
  return request('/auth/me')
}

export function updateProfile(body: ProfileUpdateRequest): Promise<User> {
  return request('/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function changePassword(body: PasswordChangeRequest): Promise<void> {
  return request('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function updateChatSessionPolicy(id: number, policyId: number | null): Promise<ChatSessionListItem> {
  return request(`/chat/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy_id: policyId }),
  })
}

export function sendSessionMessage(
  id: number,
  message: string,
  onEvent: (event: SessionChatStreamEvent) => void,
  opts?: { voice?: boolean },
  signal?: AbortSignal,
): Promise<void> {
  return streamNdjson(
    `/chat/sessions/${id}/messages`,
    { message, voice: opts?.voice ?? false },
    onEvent as (event: unknown) => void,
    signal,
  )
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

/**
 * Streams synthesized speech sentence-by-sentence: the backend frames each
 * sentence's WAV bytes as [4-byte big-endian length][payload] and sends them
 * as they're synthesized, so `onChunk` can start playing sentence 1 while
 * later sentences are still being generated.
 */
export async function speakTextStream(
  text: string,
  onChunk: (blob: Blob) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/voice/speak-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)

  function append(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
    const out = new Uint8Array(a.length + b.length)
    out.set(a, 0)
    out.set(b, a.length)
    return out
  }

  while (true) {
    const { done, value } = await reader.read()
    if (value) buffer = append(buffer, value)
    if (done) break

    // Drain as many complete [length][payload] frames as are buffered.
    while (buffer.length >= 4) {
      const frameLen = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, false)
      if (buffer.length < 4 + frameLen) break

      const payload = buffer.slice(4, 4 + frameLen)
      buffer = buffer.slice(4 + frameLen)
      onChunk(new Blob([payload], { type: 'audio/wav' }))
    }
  }
}
