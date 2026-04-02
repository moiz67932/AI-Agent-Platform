// ─── Industry Types ───
export type IndustryType = 'dental' | 'med_spa' | 'hvac' | 'restoration' | 'generic' | 'other';

export const INDUSTRY_COLORS: Record<IndustryType, string> = {
  dental: '#0D9488',
  med_spa: '#9333EA',
  hvac: '#F97316',
  restoration: '#EF4444',
  generic: '#3B82F6',
  other: '#3B82F6',
};

export const INDUSTRY_LABELS: Record<IndustryType, string> = {
  dental: 'Dental Clinic',
  med_spa: 'Med Spa / Aesthetics',
  hvac: 'HVAC / Plumbing',
  restoration: 'Water/Fire Restoration',
  generic: 'General Business',
  other: 'Other',
};

// ─── Organization ───
export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

// ─── Clinic ───
export interface Clinic {
  id: string;
  organization_id: string;
  name: string;
  industry: IndustryType;
  timezone: string;
  phone: string;
  email: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  website?: string;
  working_hours: WorkingHours;
  created_at: string;
}

// ─── Working Hours ───
export interface DaySchedule {
  open: boolean;
  start: string; // "09:00"
  end: string;   // "17:00"
  breaks?: { start: string; end: string }[];
}

export type WorkingHours = Record<string, DaySchedule>;

// ─── Agent ───
export interface Agent {
  id: string;
  organization_id: string;
  clinic_id: string;
  name: string;
  status: 'live' | 'paused' | 'draft' | 'deploying' | 'error' | 'offline';
  port?: number | null;
  subdomain?: string | null;
  phone_number?: PhoneNumber | null;
  twilio_phone_sid?: string | null;
  deploy_error?: string | null;
  deploy_progress?: number | null;
  hetzner_server_ip?: string | null;
  livekit_agent_name?: string | null;
  livekit_trunk_id?: string | null;
  livekit_dispatch_rule_id?: string | null;
  sip_auth_username?: string | null;
  sip_auth_password?: string | null;
  config_json?: Record<string, unknown>;
  default_language: string;
  created_at: string;
  updated_at: string;
  // Joined data
  clinic?: Clinic;
  settings?: AgentSettings;
}

// ─── Agent Settings ───
export interface AgentSettings {
  id: string;
  organization_id: string;
  agent_id: string;
  greeting_text: string;
  persona_tone: 'professional' | 'warm' | 'enthusiastic' | 'formal';
  voice_id: string;
  config_json: AgentConfig;
  created_at: string;
}

export interface AgentConfig {
  industry_type?: IndustryType;
  working_hours?: Record<string, { start: string; end: string }[]>;
  closed_dates?: string[];
  treatment_durations: Record<string, number>;
  services: ServiceItem[];
  emergency_handling: boolean;
  emergency_script?: string;
  collect_insurance: boolean;
  cancellation_policy?: string;
  custom_instructions?: string;
  agent_role: string;
  notification_email?: string;
  webhook_url?: string;
}

export interface ServiceItem {
  name: string;
  duration: number; // minutes
  price?: number;
  enabled: boolean;
}

// ─── Knowledge Article ───
export interface KnowledgeArticle {
  id: string;
  organization_id: string;
  clinic_id: string;
  title: string;
  category: string;
  body: string;
  status: 'active' | 'draft' | 'processing';
  created_at: string;
  updated_at: string;
}

// ─── Call Session ───
export interface CallSession {
  id: string;
  clinic_id: string;
  agent_id: string;
  phone_number_id?: string;
  caller_number?: string;
  caller_name?: string;
  outcome: 'booked' | 'info_only' | 'missed' | 'transferred' | 'voicemail' | 'error';
  duration_seconds: number;
  started_at: string;
  ended_at?: string;
  response_time_ms?: number | null;
  summary?: string | null;
  transcript_text?: string | null;
  transcript?: TranscriptEntry[];
  // Joined
  agent?: Agent;
  appointment?: Appointment;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'ai' | 'caller';
  text: string;
  timestamp: string;
  stt_latency_ms?: number;
  llm_latency_ms?: number;
  tts_latency_ms?: number;
}

// ─── Appointment ───
export interface Appointment {
  id: string;
  clinic_id: string;
  patient_name: string;
  patient_phone?: string;
  patient_email?: string;
  start_time: string;
  end_time: string;
  reason: string;
  service_requested?: string | null;
  appointment_at?: string | null;
  caller_name?: string | null;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  source: 'ai' | 'manual' | 'online' | 'walk_in';
  notes?: string;
  created_at: string;
  // Joined
  clinic?: Clinic;
}

// ─── Phone Number ───
export interface PhoneNumber {
  id: string;
  organization_id: string;
  clinic_id?: string;
  agent_id?: string;
  phone_number: string;
  phone_e164: string;
  label?: string;
  status: 'active' | 'unassigned' | 'suspended';
  monthly_cost: number;
  telnyx_id?: string;
  created_at: string;
}

// ─── Analytics ───
export interface AnalyticsData {
  total_calls: number;
  total_bookings: number;
  booking_rate: number;
  avg_duration: number;
  calls_answered: number;
  missed_calls: number;
  calls_by_day: { date: string; calls: number; booked: number }[];
  calls_by_hour: { hour: number; count: number }[];
  calls_by_weekday: { day: string; count: number }[];
  outcomes?: Record<string, number>;
  outcome_breakdown: { outcome: string; count: number }[];
  service_breakdown: { service: string; requested: number; booked: number; avg_duration: number }[];
  services_by_day?: { service: string; data: number[] }[];
  service_days?: string[];
  source_breakdown?: { source: string; count: number; pct: number }[];
  agent_breakdown: {
    agent_id: string;
    calls: number;
    booked: number;
    booking_rate: number;
    avg_duration: number;
    missed_calls: number;
  }[];
}

// ─── User / Auth ───
export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  organization_id?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

// ─── Team Member ───
export interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  email: string;
  full_name: string;
  joined_at: string;
}

// ─── Webhook Config ───
export interface WebhookConfig {
  id: string;
  organization_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  url: string;
  status_code: number;
  response_time_ms: number;
  created_at: string;
}

// ─── Onboarding ───
export interface OnboardingData {
  industry: IndustryType;
  business: {
    name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
    website?: string;
    timezone: string;
  };
  hours: WorkingHours;
  services: ServiceItem[];
  agent: {
    name: string;
    role: string;
    greeting: string;
    tone: 'professional' | 'warm' | 'enthusiastic' | 'formal';
    voice_id: string;
    emergency_handling: boolean;
    emergency_script?: string;
    collect_insurance: boolean;
    cancellation_policy?: string;
    custom_instructions?: string;
  };
  knowledge: {
    articles: { title: string; body: string; category: string }[];
  };
  phone: {
    type: 'new' | 'existing';
    number?: string;
    telnyx_id?: string;
  };
}

// ─── API Response ───
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

// ─── Pagination ───
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
