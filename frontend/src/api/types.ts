export type PolicyStatus = 'processing' | 'ready' | 'failed'
export type PolicyType = 'health' | 'life'

export interface PolicyListItem {
  id: number
  policy_type: PolicyType
  insurer: string | null
  product_name: string | null
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

export interface PolicySummary {
  policy_number: string | null
  insurer: string | null
  product_name: string | null
  policyholder_name: string | null
  sum_insured: string | null
  premium_amount: string | null
  premium_due_date: string | null
  policy_start_date: string | null
  policy_end_date: string | null
  plan_variant: string | null
  riders: string[]
  waiting_periods: WaitingPeriod[]
  key_exclusions: string[]
  nominee: string | null
  claim_process_summary: string | null
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
}

export interface ChatResponse {
  answer: string
  sources: string[]
  policy_type: string | null
  needs_clarification: boolean
  clarification_question: string | null
  timings: Record<string, number> | null
}

export interface VoiceTranscribeResponse {
  transcript: string
}
