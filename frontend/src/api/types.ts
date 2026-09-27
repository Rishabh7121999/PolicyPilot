export type PolicyStatus = 'processing' | 'ready' | 'failed'
export type PolicyType = 'health' | 'life' | 'motor' | 'unknown'

export interface PolicyListItem {
  id: number
  policy_type: PolicyType
  insurer: string | null
  product_name: string | null
  policy_number: string | null
  sum_insured: string | null
  sum_insured_numeric: number | null
  policy_end_date: string | null
  policy_end_date_iso: string | null
  source_file: string
  status: PolicyStatus
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface WaitingPeriod {
  condition: string | null
  duration: string | null
}

export interface FAQ {
  question: string
  answer: string
}

export interface HealthDetails {
  room_rent_limit: string | null
  pre_hospitalization_days: string | null
  post_hospitalization_days: string | null
  co_pay_percentage: string | null
  sub_limits: string[]
  day_care_procedures: string[]
  network_hospitals_info: string | null
  restoration_benefit: string | null
  no_claim_bonus: string | null
  maternity_cover: string | null
  ambulance_cover: string | null
  health_checkup_benefit: string | null
}

export interface LifeDetails {
  policy_term: string | null
  premium_paying_term: string | null
  death_benefit: string | null
  maturity_benefit: string | null
  surrender_value: string | null
  tax_benefit: string | null
  free_look_period: string | null
  grace_period: string | null
  policy_loan_available: string | null
  plan_type: string | null
}

export interface MotorDetails {
  registration_number: string | null
  make_model_variant: string | null
  year_of_manufacture: string | null
  idv: string | null
  cover_type: string | null
  no_claim_bonus_percentage: string | null
  add_ons: string[]
  compulsory_deductible: string | null
  third_party_liability_limit: string | null
  pa_cover_owner_driver: string | null
  cashless_garage_network_info: string | null
}

export interface PolicySummary {
  policy_type: PolicyType
  policy_number: string | null
  insurer: string | null
  product_name: string | null
  policyholder_name: string | null
  sum_insured: string | null
  sum_insured_numeric: number | null
  premium_amount: string | null
  premium_due_date: string | null
  policy_start_date: string | null
  policy_end_date: string | null
  policy_end_date_iso: string | null
  plan_variant: string | null
  riders: string[]
  waiting_periods: WaitingPeriod[]
  key_exclusions: string[]
  nominee: string | null
  claim_process_summary: string | null
  faqs: FAQ[]
  health_details: HealthDetails | null
  life_details: LifeDetails | null
  motor_details: MotorDetails | null
}

export interface PolicyDetail extends PolicyListItem {
  error_message: string | null
  summary_json: PolicySummary | null
}

export interface PolicyUploadResponse {
  id: number
  status: PolicyStatus
}

export interface ChatRequest {
  message: string
  history: string[]
  policy_id: number | null
  voice?: boolean
}

export interface ClarificationOption {
  id: number
  label: string
}

// Streamed as newline-delimited JSON from POST /chat and
// POST /chat/sessions/{id}/messages: one `meta` event as soon as scoping is
// resolved, then one `token` event per generated chunk, then a final `done`.
export interface ChatStreamMetaEvent {
  type: 'meta'
  resolved_policy: ClarificationOption | null
  clarification_options: ClarificationOption[] | null
  needs_clarification: boolean
  policy_type: string | null
}

export interface ChatStreamTokenEvent {
  type: 'token'
  text: string
}

// POST /chat's `done` -- ephemeral, no persisted message.
export interface ChatStreamDoneEvent {
  type: 'done'
  answer: string
  sources: string[]
  timings: Record<string, number> | null
  resolved_policy: ClarificationOption | null
  clarification_options: ClarificationOption[] | null
  needs_clarification: boolean
}

export type ChatStreamEvent = ChatStreamMetaEvent | ChatStreamTokenEvent | ChatStreamDoneEvent

// POST /chat/sessions/{id}/messages's `done` -- carries the persisted rows.
export interface SessionChatStreamDoneEvent {
  type: 'done'
  user_message: ChatMessageItem
  assistant_message: ChatMessageItem
  session_title: string | null
  needs_clarification: boolean
}

export type SessionChatStreamEvent =
  | ChatStreamMetaEvent
  | ChatStreamTokenEvent
  | SessionChatStreamDoneEvent

export interface VoiceTranscribeResponse {
  transcript: string
}

export interface ChatSessionListItem {
  id: number
  title: string | null
  policy_id: number | null
  created_at: string
  updated_at: string
}

export interface ChatMessageMeta {
  clarification_options?: ClarificationOption[]
  resolved_policy?: ClarificationOption
}

export interface ChatMessageItem {
  id: number
  role: 'user' | 'assistant'
  text: string
  sources: string[] | null
  meta: ChatMessageMeta | null
  created_at: string
}

export interface ChatSessionDetail extends ChatSessionListItem {
  messages: ChatMessageItem[]
}

export interface User {
  id: number
  name: string
  email: string
  phone: string | null
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user: User
}

export interface SignupRequest {
  name: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ProfileUpdateRequest {
  name?: string
  email?: string
  phone?: string | null
}

export interface PasswordChangeRequest {
  current_password: string
  new_password: string
}
