import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OnboardingData, IndustryType, ServiceItem, WorkingHours } from '@/types';

interface OnboardingState {
  step: number;
  data: OnboardingData;
  setStep: (step: number) => void;
  setIndustry: (industry: IndustryType) => void;
  setBusiness: (business: OnboardingData['business']) => void;
  setHours: (hours: WorkingHours) => void;
  setServices: (services: ServiceItem[]) => void;
  setAgent: (agent: OnboardingData['agent']) => void;
  setKnowledge: (knowledge: OnboardingData['knowledge']) => void;
  setPhone: (phone: OnboardingData['phone']) => void;
  reset: () => void;
}

const DEFAULT_HOURS: WorkingHours = {
  monday: { open: true, start: '09:00', end: '17:00' },
  tuesday: { open: true, start: '09:00', end: '17:00' },
  wednesday: { open: true, start: '09:00', end: '17:00' },
  thursday: { open: true, start: '09:00', end: '17:00' },
  friday: { open: true, start: '09:00', end: '17:00' },
  saturday: { open: false, start: '09:00', end: '13:00' },
  sunday: { open: false, start: '09:00', end: '13:00' },
};

const initialData: OnboardingData = {
  industry: 'dental',
  business: {
    name: '',
    address_line1: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    phone: '',
    email: '',
    timezone: 'America/New_York',
  },
  hours: DEFAULT_HOURS,
  services: [],
  agent: {
    name: 'Sarah',
    role: 'receptionist',
    greeting: '',
    tone: 'warm',
    voice_id: 'ava',
    emergency_handling: false,
    collect_insurance: false,
  },
  knowledge: { articles: [] },
  phone: { type: 'new' },
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      step: 1,
      data: { ...initialData },
      setStep: (step) => set({ step }),
      setIndustry: (industry) => set((s) => ({ data: { ...s.data, industry } })),
      setBusiness: (business) => set((s) => ({ data: { ...s.data, business } })),
      setHours: (hours) => set((s) => ({ data: { ...s.data, hours } })),
      setServices: (services) => set((s) => ({ data: { ...s.data, services } })),
      setAgent: (agent) => set((s) => ({ data: { ...s.data, agent } })),
      setKnowledge: (knowledge) => set((s) => ({ data: { ...s.data, knowledge } })),
      setPhone: (phone) => set((s) => ({ data: { ...s.data, phone } })),
      reset: () => set({ step: 1, data: { ...initialData } }),
    }),
    { name: 'voiceai-onboarding' }
  )
);
