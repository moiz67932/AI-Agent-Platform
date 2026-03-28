import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronRight, ChevronLeft, X, Plus, Trash2,
  Building2, Sparkles, Wrench, Droplets, Globe, HelpCircle,
  Phone, Play, Mic, Upload, Link as LinkIcon, CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import type { IndustryType, ServiceItem, WorkingHours } from '@/types';

const TOTAL_STEPS = 8;

const INDUSTRIES: { type: IndustryType; icon: typeof Building2; label: string; description: string }[] = [
  { type: 'dental', icon: Building2, label: 'Dental Clinic', description: 'Scheduling cleanings, checkups, and procedures' },
  { type: 'med_spa', icon: Sparkles, label: 'Med Spa / Aesthetics', description: 'Botox, facials, laser treatments' },
  { type: 'hvac', icon: Wrench, label: 'HVAC / Plumbing', description: 'Emergency dispatch and service scheduling' },
  { type: 'restoration', icon: Droplets, label: 'Water/Fire Restoration', description: '24/7 emergency triage and job capture' },
  { type: 'generic', icon: Globe, label: 'General Business', description: 'Customizable for any service business' },
  { type: 'other', icon: HelpCircle, label: 'Other', description: 'Tell us about your business' },
];

const DEFAULT_SERVICES: Record<IndustryType, ServiceItem[]> = {
  dental: [
    { name: 'Consultation', duration: 30, price: 0, enabled: true },
    { name: 'Cleaning', duration: 30, price: 150, enabled: true },
    { name: 'Filling', duration: 45, price: 250, enabled: true },
    { name: 'Crown', duration: 90, price: 1200, enabled: true },
    { name: 'Root Canal', duration: 90, price: 1500, enabled: true },
    { name: 'Teeth Whitening', duration: 60, price: 400, enabled: true },
  ],
  med_spa: [
    { name: 'HydraFacial', duration: 60, price: 200, enabled: true },
    { name: 'Botox', duration: 30, price: 400, enabled: true },
    { name: 'Dermal Filler', duration: 45, price: 600, enabled: true },
    { name: 'Chemical Peel', duration: 45, price: 150, enabled: true },
    { name: 'Laser Hair Removal', duration: 45, price: 300, enabled: true },
    { name: 'Massage', duration: 60, price: 120, enabled: true },
  ],
  hvac: [
    { name: 'Emergency Call', duration: 60, price: 200, enabled: true },
    { name: 'Service Estimate', duration: 60, price: 0, enabled: true },
    { name: 'HVAC Installation', duration: 240, price: 3000, enabled: true },
    { name: 'Tune-Up', duration: 90, price: 150, enabled: true },
    { name: 'AC Repair', duration: 120, price: 350, enabled: true },
  ],
  restoration: [
    { name: 'Emergency Assessment', duration: 60, price: 0, enabled: true },
    { name: 'Water Damage Restoration', duration: 240, price: 2500, enabled: true },
    { name: 'Fire Damage Restoration', duration: 480, price: 5000, enabled: true },
    { name: 'Mold Remediation', duration: 240, price: 3000, enabled: true },
  ],
  generic: [
    { name: 'Consultation', duration: 30, price: 0, enabled: true },
    { name: 'Service Appointment', duration: 60, price: 100, enabled: true },
  ],
  other: [{ name: 'Consultation', duration: 30, price: 0, enabled: true }],
};

const VOICES = [
  { id: 'ava', name: 'Ava', description: 'Warm female' },
  { id: 'marcus', name: 'Marcus', description: 'Professional male' },
  { id: 'luna', name: 'Luna', description: 'Young female' },
  { id: 'james', name: 'James', description: 'Formal male' },
  { id: 'sophia', name: 'Sophia', description: 'Energetic female' },
  { id: 'carter', name: 'Carter', description: 'Friendly male' },
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

const businessSchema = z.object({
  name: z.string().min(2, 'Business name required'),
  address_line1: z.string().min(5, 'Address required'),
  city: z.string().min(2, 'City required'),
  state: z.string().min(2, 'State required'),
  zip: z.string().min(5, 'ZIP required'),
  country: z.string().default('US'),
  phone: z.string().min(10, 'Phone required'),
  email: z.string().email('Valid email required'),
  website: z.string().optional(),
  timezone: z.string(),
});

type BusinessForm = z.infer<typeof businessSchema>;

// ─── Step 1: Industry ───────────────────────────────────────────────────────
function Step1Industry() {
  const { data, setIndustry, setServices } = useOnboardingStore();
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">What type of business are you?</h2>
        <p className="mt-1 text-muted-foreground">We'll customize your agent based on your industry</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INDUSTRIES.map(({ type, icon: Icon, label, description }) => (
          <button
            key={type}
            onClick={() => {
              setIndustry(type);
              setServices(DEFAULT_SERVICES[type]);
            }}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all duration-200',
              data.industry === type
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/50 hover:bg-accent'
            )}
          >
            <Icon className="h-8 w-8" />
            <div>
              <div className="font-semibold text-sm">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Business Info ───────────────────────────────────────────────────
function Step2Business({ onNext }: { onNext: () => void }) {
  const { data, setBusiness } = useOnboardingStore();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: data.business,
  });
  const tz = watch('timezone');

  return (
    <form onSubmit={handleSubmit((v) => { setBusiness(v); onNext(); })} className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Business Information</h2>
        <p className="mt-1 text-muted-foreground">Tell us about your business</p>
      </div>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label>Business Name *</Label>
          <Input {...register('name')} placeholder="Bright Smile Dental" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input {...register('address_line1')} placeholder="123 Main St" />
            {errors.address_line1 && <p className="text-xs text-destructive">{errors.address_line1.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input {...register('city')} placeholder="New York" />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input {...register('state')} placeholder="NY" />
          </div>
          <div className="space-y-1.5">
            <Label>ZIP</Label>
            <Input {...register('zip')} placeholder="10001" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input {...register('phone')} placeholder="+1 (555) 000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input {...register('email')} type="email" placeholder="hello@business.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Website (optional)</Label>
            <Input {...register('website')} placeholder="https://yourbusiness.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Timezone</Label>
            <Select value={tz} onValueChange={(v) => setValue('timezone', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full">Continue <ChevronRight className="h-4 w-4" /></Button>
    </form>
  );
}

// ─── Step 3: Working Hours ───────────────────────────────────────────────────
function Step3Hours() {
  const { data, setHours } = useOnboardingStore();
  const [hours, setLocalHours] = useState<WorkingHours>(data.hours);

  const update = (day: string, field: string, value: string | boolean) => {
    const updated = { ...hours, [day]: { ...hours[day], [field]: value } };
    setLocalHours(updated);
    setHours(updated);
  };

  const applyPreset = (preset: string) => {
    const base = { start: '09:00', end: '17:00' };
    let updated: WorkingHours = { ...hours };
    if (preset === 'mon-fri') {
      DAYS.forEach((d) => { updated[d] = { ...base, open: !['saturday', 'sunday'].includes(d) }; });
    } else if (preset === 'mon-sat') {
      DAYS.forEach((d) => { updated[d] = { ...base, open: d !== 'sunday' }; });
    } else if (preset === '247') {
      DAYS.forEach((d) => { updated[d] = { start: '00:00', end: '23:59', open: true }; });
    }
    setLocalHours(updated);
    setHours(updated);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">When are you open?</h2>
        <p className="mt-1 text-muted-foreground">Set your business hours</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        {['Mon-Fri 9-5', 'Mon-Sat 9-6', '24/7'].map((p, i) => (
          <Button key={p} variant="outline" size="sm" onClick={() => applyPreset(['mon-fri', 'mon-sat', '247'][i])}>
            {p}
          </Button>
        ))}
      </div>
      <div className="space-y-3">
        {DAYS.map((day) => {
          const schedule = hours[day] || { open: false, start: '09:00', end: '17:00' };
          return (
            <div key={day} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Switch checked={schedule.open} onCheckedChange={(v) => update(day, 'open', v)} />
              <span className="w-24 font-medium text-sm capitalize">{DAY_LABELS[day]}</span>
              {schedule.open ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={schedule.start}
                    onChange={(e) => update(day, 'start', e.target.value)}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={schedule.end}
                    onChange={(e) => update(day, 'end', e.target.value)}
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: Services ────────────────────────────────────────────────────────
function Step4Services() {
  const { data, setServices } = useOnboardingStore();
  const [services, setLocalServices] = useState<ServiceItem[]>(data.services);

  const update = (i: number, field: keyof ServiceItem, value: string | number | boolean) => {
    const updated = services.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    setLocalServices(updated);
    setServices(updated);
  };

  const add = () => {
    const updated = [...services, { name: 'New Service', duration: 30, enabled: true }];
    setLocalServices(updated);
    setServices(updated);
  };

  const remove = (i: number) => {
    const updated = services.filter((_, idx) => idx !== i);
    setLocalServices(updated);
    setServices(updated);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Services & Pricing</h2>
        <p className="mt-1 text-muted-foreground">What services do you offer?</p>
      </div>
      <div className="space-y-2">
        {services.map((svc, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3">
            <Switch checked={svc.enabled} onCheckedChange={(v) => update(i, 'enabled', v)} />
            <Input
              value={svc.name}
              onChange={(e) => update(i, 'name', e.target.value)}
              className="flex-1"
              placeholder="Service name"
            />
            <Select value={String(svc.duration)} onValueChange={(v) => update(i, 'duration', parseInt(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[15, 30, 45, 60, 90, 120, 180, 240].map((d) => (
                  <SelectItem key={d} value={String(d)}>{d}min</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-24">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                value={svc.price || ''}
                onChange={(e) => update(i, 'price', parseFloat(e.target.value) || 0)}
                className="pl-6"
                placeholder="0"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" className="w-full" onClick={add}>
        <Plus className="h-4 w-4 mr-2" /> Add Service
      </Button>
    </div>
  );
}

// ─── Step 5: Agent Config ────────────────────────────────────────────────────
function Step5Agent() {
  const { data, setAgent } = useOnboardingStore();
  const [agent, setLocalAgent] = useState(data.agent);

  const update = <K extends keyof typeof agent>(field: K, value: typeof agent[K]) => {
    const updated = { ...agent, [field]: value };
    setLocalAgent(updated);
    setAgent(updated);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Design Your AI Agent</h2>
        <p className="mt-1 text-muted-foreground">Customize your agent's personality and behavior</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Agent Name</Label>
            <Input value={agent.name} onChange={(e) => update('name', e.target.value)} placeholder="Sarah" />
          </div>
          <div className="space-y-1.5">
            <Label>Agent Role</Label>
            <Select value={agent.role} onValueChange={(v) => update('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receptionist">Receptionist</SelectItem>
                <SelectItem value="booking specialist">Booking Specialist</SelectItem>
                <SelectItem value="dispatcher">Dispatcher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Greeting Script</Label>
            <Textarea
              value={agent.greeting}
              onChange={(e) => update('greeting', e.target.value)}
              placeholder={`Hi, thanks for calling ${data.business.name || '[Business Name]'}! This is ${agent.name}, how can I help you today?`}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Persona Tone</Label>
            <Select value={agent.tone} onValueChange={(v) => update('tone', v as typeof agent.tone)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Emergency Routing</div>
              <div className="text-xs text-muted-foreground">Route urgent calls immediately</div>
            </div>
            <Switch checked={agent.emergency_handling} onCheckedChange={(v) => update('emergency_handling', v)} />
          </div>
          {agent.emergency_handling && (
            <Textarea
              value={agent.emergency_script || ''}
              onChange={(e) => update('emergency_script', e.target.value)}
              placeholder="For emergencies, I'll connect you immediately..."
              rows={2}
            />
          )}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Collect Insurance Info</div>
              <div className="text-xs text-muted-foreground">Ask callers for insurance details</div>
            </div>
            <Switch checked={agent.collect_insurance} onCheckedChange={(v) => update('collect_insurance', v)} />
          </div>
        </div>

        {/* Voice Selection */}
        <div className="space-y-3">
          <Label>Voice</Label>
          <div className="grid grid-cols-2 gap-2">
            {VOICES.map((voice) => (
              <button
                key={voice.id}
                onClick={() => update('voice_id', voice.id)}
                className={cn(
                  'flex items-center justify-between rounded-lg border p-3 text-left transition-all',
                  agent.voice_id === voice.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                )}
              >
                <div>
                  <div className="font-medium text-sm">{voice.name}</div>
                  <div className="text-xs text-muted-foreground">{voice.description}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => { e.stopPropagation(); }}
                >
                  <Play className="h-3 w-3" />
                </Button>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 mt-4">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Mic className="h-3 w-3" /> Live Preview
            </div>
            <div className="rounded-lg bg-card p-3 text-sm">
              <span className="text-primary font-medium">{agent.name}:</span>{' '}
              {agent.greeting || `Hi, thanks for calling ${data.business.name || 'us'}! This is ${agent.name}, how can I help you today?`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 6: Knowledge Base ──────────────────────────────────────────────────
const SUGGESTED_QA: Record<IndustryType, { q: string; a: string }[]> = {
  dental: [
    { q: 'Do you accept insurance?', a: 'Yes, we accept most major dental insurance plans. Please bring your insurance card to your appointment.' },
    { q: 'What are your hours?', a: 'We are open Monday through Friday, 9am to 5pm.' },
    { q: 'How much does a cleaning cost?', a: 'A routine cleaning typically costs $150-$200 depending on your insurance.' },
    { q: 'Do you offer payment plans?', a: 'Yes, we offer flexible payment plans through CareCredit and in-house financing.' },
    { q: 'How do I book an appointment?', a: "You're already on the right track! I can book you right now." },
    { q: 'Is there parking available?', a: 'Yes, we have free parking in our lot adjacent to the building.' },
  ],
  med_spa: [
    { q: 'What is your cancellation policy?', a: 'We require 24 hours notice for cancellations. Late cancellations may incur a fee.' },
    { q: 'Do you offer memberships?', a: 'Yes! Our monthly membership includes discounts on all services and priority booking.' },
    { q: 'What should I do before Botox?', a: 'Avoid blood thinners, alcohol, and strenuous exercise 24 hours before your appointment.' },
    { q: 'How long does Botox last?', a: 'Results typically last 3-4 months. We recommend follow-ups every quarter.' },
  ],
  hvac: [
    { q: 'Do you offer emergency service?', a: 'Yes, we provide 24/7 emergency HVAC service. Call us anytime.' },
    { q: 'What areas do you serve?', a: 'We serve the greater metropolitan area and surrounding suburbs.' },
    { q: 'How long does installation take?', a: 'Most residential installations are completed in 4-8 hours.' },
  ],
  restoration: [
    { q: 'How quickly can you respond?', a: 'We guarantee on-site response within 2 hours for water damage emergencies.' },
    { q: 'Do you work with insurance?', a: 'Yes, we work directly with all major insurance companies to streamline your claim.' },
  ],
  generic: [
    { q: 'What are your hours?', a: 'We are open Monday through Friday, 9am to 5pm.' },
    { q: 'Where are you located?', a: 'Please contact us for our exact location details.' },
  ],
  other: [
    { q: 'What services do you offer?', a: 'We offer a range of customized services. Please call us to discuss your needs.' },
  ],
};

function Step6Knowledge() {
  const { data, setKnowledge } = useOnboardingStore();
  const suggestions = SUGGESTED_QA[data.industry] || SUGGESTED_QA.generic;
  const [enabled, setEnabled] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(suggestions.map((_, i) => [i, true]))
  );
  const [answers, setAnswers] = useState<Record<number, string>>(() =>
    Object.fromEntries(suggestions.map((s, i) => [i, s.a]))
  );

  const save = () => {
    const articles = suggestions
      .filter((_, i) => enabled[i])
      .map((s, i) => ({ title: s.q, body: answers[i], category: 'FAQ' }));
    setKnowledge({ articles });
  };

  return (
    <div className="space-y-6" onBlur={save}>
      <div className="text-center">
        <h2 className="text-2xl font-bold">Teach Your Agent</h2>
        <p className="mt-1 text-muted-foreground">Add FAQs and information your agent should know</p>
      </div>
      <Tabs defaultValue="quick">
        <TabsList className="w-full">
          <TabsTrigger value="quick" className="flex-1">Quick Add</TabsTrigger>
          <TabsTrigger value="upload" className="flex-1">Upload File</TabsTrigger>
          <TabsTrigger value="website" className="flex-1">Website Import</TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="space-y-3 mt-4">
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-border">
              <div className="flex items-center gap-3 p-3">
                <Switch checked={enabled[i]} onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [i]: v }))} />
                <span className="font-medium text-sm flex-1">{s.q}</span>
              </div>
              {enabled[i] && (
                <div className="border-t border-border px-3 pb-3">
                  <Textarea
                    value={answers[i]}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                    rows={2}
                    className="mt-2 text-sm"
                  />
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-12 text-center">
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <div className="font-medium">Drop files here or click to upload</div>
            <div className="text-sm text-muted-foreground mt-1">PDF, DOCX, TXT supported</div>
            <Button variant="outline" className="mt-4">Browse Files</Button>
          </div>
        </TabsContent>

        <TabsContent value="website" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input placeholder="https://yourbusiness.com" />
            <Button variant="outline">
              <LinkIcon className="h-4 w-4 mr-2" /> Import
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">We'll scan your website and extract FAQ content automatically.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Step 7: Phone Number ────────────────────────────────────────────────────
function Step7Phone() {
  const { data, setPhone } = useOnboardingStore();

  const toE164 = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : '';
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Connect Your Phone Number</h2>
        <p className="mt-1 text-muted-foreground">Add a Twilio number for your AI agent</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground">How phone numbers work</p>
        <p>1. Purchase a number in your <span className="text-primary">Twilio console</span></p>
        <p>2. Point it at your LiveKit SIP trunk in Twilio's settings</p>
        <p>3. Enter it below — your agent will receive calls on this number</p>
        <p className="pt-1 text-xs">You can skip this step and add a number later from the Phone Numbers page.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Twilio Phone Number</Label>
        <Input
          value={data.phone.number || ''}
          onChange={(e) => {
            const e164 = toE164(e.target.value);
            setPhone({ type: 'existing', number: e164 || e.target.value });
          }}
          placeholder="+12125550100"
        />
        <p className="text-xs text-muted-foreground">Enter in any format — e.g. (212) 555-0100, 12125550100, +12125550100</p>
      </div>
    </div>
  );
}

// ─── Step 8: Review & Launch ─────────────────────────────────────────────────
function Step8Review({ onLaunch, launching }: { onLaunch: () => void; launching: boolean }) {
  const { data } = useOnboardingStore();
  const enabledServices = data.services.filter((s) => s.enabled);
  const enabledArticles = data.knowledge.articles.length;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">You're Almost Live!</h2>
        <p className="mt-1 text-muted-foreground">Review your configuration before launching</p>
      </div>
      <div className="space-y-3">
        {[
          { label: 'Business', value: `${data.business.name} — ${data.industry}` },
          { label: 'Timezone', value: data.business.timezone },
          { label: 'Agent', value: `${data.agent.name} (${data.agent.tone} tone, ${data.agent.voice_id} voice)` },
          { label: 'Services', value: `${enabledServices.length} services configured` },
          { label: 'Knowledge Base', value: `${enabledArticles} articles` },
          { label: 'Phone Number', value: data.phone.number || 'Not selected' },
        ].map((row) => (
          <div key={row.label} className="flex justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-sm font-medium">{row.value}</span>
          </div>
        ))}
      </div>
      <Button onClick={onLaunch} disabled={launching} size="xl" className="w-full text-base">
        {launching ? 'Launching...' : '🚀 Launch Agent'}
      </Button>
    </div>
  );
}

// ─── Success Screen ──────────────────────────────────────────────────────────
function SuccessScreen({ phoneNumber }: { phoneNumber: string }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center text-center py-8 space-y-6"
    >
      <div className="rounded-full bg-emerald-500/20 p-6">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-3xl font-bold">Your agent is live!</h2>
        <p className="mt-2 text-muted-foreground">Start receiving AI-powered calls right now</p>
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-8 py-4">
        <p className="text-sm text-muted-foreground mb-1">Your phone number</p>
        <p className="text-2xl font-mono font-bold text-primary">{phoneNumber || '+1 (555) 000-0000'}</p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        <Button variant="outline" onClick={() => navigate('/agents')}>View Agent</Button>
      </div>
    </motion.div>
  );
}

// ─── Main Onboarding ─────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate();
  const { step, setStep, data, reset } = useOnboardingStore();
  const { user, org, setOrg, signOut } = useAuthStore();
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [launchedPhone, setLaunchedPhone] = useState('');

  const prev = () => setStep(Math.max(1, step - 1));
  const next = () => setStep(Math.min(TOTAL_STEPS, step + 1));
  const canNext = step !== 2 && step !== 8;

  const launch = async () => {
    setLaunching(true);
    try {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      // 1. Create or get organization
      let orgId = org?.id;
      if (!orgId) {
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: data.business.name, owner_id: userId })
          .select()
          .single();
        if (orgError) throw orgError;
        orgId = newOrg.id;
        setOrg(newOrg);
      }

      // 2. Create clinic
      const workingHours = Object.entries(data.hours).reduce<Record<string, object>>((acc, [day, sched]) => {
        if (sched.open) acc[day] = { start: sched.start, end: sched.end, open: true };
        return acc;
      }, {});

      const { data: clinic, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          organization_id: orgId,
          name: data.business.name,
          industry: data.industry,
          timezone: data.business.timezone,
          phone: data.business.phone,
          email: data.business.email,
          address_line1: data.business.address_line1,
          city: data.business.city,
          state: data.business.state,
          zip: data.business.zip,
          country: data.business.country,
          website: data.business.website,
          working_hours: workingHours,
        })
        .select()
        .single();
      if (clinicError) throw clinicError;

      // 3. Create agent
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .insert({
          organization_id: orgId,
          clinic_id: clinic.id,
          name: data.agent.name,
          status: 'live',
          default_language: 'en',
        })
        .select()
        .single();
      if (agentError) throw agentError;

      // 4. Create agent_settings
      const treatmentDurations = Object.fromEntries(data.services.map((s) => [s.name, s.duration]));
      const { error: settingsError } = await supabase
        .from('agent_settings')
        .insert({
          organization_id: orgId,
          agent_id: agent.id,
          greeting_text: data.agent.greeting || `Hi, thanks for calling ${data.business.name}! This is ${data.agent.name}, how can I help?`,
          persona_tone: data.agent.tone,
          voice_id: data.agent.voice_id,
          config_json: {
            treatment_durations: treatmentDurations,
            services: data.services,
            emergency_handling: data.agent.emergency_handling,
            emergency_script: data.agent.emergency_script,
            collect_insurance: data.agent.collect_insurance,
            cancellation_policy: data.agent.cancellation_policy,
            custom_instructions: data.agent.custom_instructions,
            agent_role: data.agent.role,
          },
        });
      if (settingsError) throw settingsError;

      // 5. Create knowledge articles
      if (data.knowledge.articles.length > 0) {
        const articles = data.knowledge.articles.map((a) => ({
          organization_id: orgId,
          clinic_id: clinic.id,
          title: a.title,
          body: a.body,
          category: a.category,
          status: 'active',
        }));
        await supabase.from('knowledge_articles').insert(articles);
      }

      // 6. Assign phone number (optional — skip if not provided)
      const rawPhone = data.phone.number?.trim();
      if (rawPhone) {
        const digits = rawPhone.replace(/\D/g, '');
        let e164 = rawPhone;
        if (digits.length === 10) e164 = `+1${digits}`;
        else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
        else if (digits.length > 0) e164 = `+${digits}`;

        const { error: phoneError } = await supabase.from('phone_numbers').insert({
          organization_id: orgId,
          clinic_id: clinic.id,
          agent_id: agent.id,
          phone_number: e164,
          phone_e164: e164,
          status: 'active',
          monthly_cost: 0,
        });
        // Non-fatal: phone insert failure doesn't block launch
        if (phoneError) console.warn('Phone insert failed:', phoneError.message);
      }

      setLaunchedPhone(rawPhone || '');
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      reset();
      setLaunched(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || String(err);
      toast({ title: 'Launch failed', description: msg, variant: 'destructive' });
    } finally {
      setLaunching(false);
    }
  };

  if (launched) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <SuccessScreen phoneNumber={launchedPhone} />
        </div>
      </div>
    );
  }

  const stepComponents: Record<number, React.ReactNode> = {
    1: <Step1Industry />,
    2: <Step2Business onNext={next} />,
    3: <Step3Hours />,
    4: <Step4Services />,
    5: <Step5Agent />,
    6: <Step6Knowledge />,
    7: <Step7Phone />,
    8: <Step8Review onLaunch={launch} launching={launching} />,
  };

  const stepLabels = [
    'Industry', 'Business', 'Hours', 'Services',
    'Agent', 'Knowledge', 'Phone', 'Launch',
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">Foyer Setup</span>
            <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Progress value={(step / TOTAL_STEPS) * 100} className="h-1.5" />
          <div className="flex justify-between mt-1.5">
            {stepLabels.map((label, i) => (
              <span
                key={label}
                className={cn(
                  'text-xs hidden sm:block',
                  i + 1 <= step ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {stepComponents[step]}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        {step !== 8 && step !== 2 && (
          <div className="mt-8 flex justify-between">
            <Button variant="outline" onClick={prev} disabled={step === 1}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {canNext && (
              <Button onClick={next}>
                Continue <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
        {step !== 1 && step === 2 && (
          <div className="mt-4">
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
