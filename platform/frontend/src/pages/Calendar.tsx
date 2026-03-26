import { useState, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Clock,
  User,
  Phone,
  FileText,
  Tag,
  Stethoscope,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppointments, useCreateAppointment } from '@/hooks/useAppointments';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/stores/authStore';
import type { Appointment } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; dot: string; badge: string }
> = {
  scheduled: {
    label: 'Scheduled',
    bg: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    dot: 'bg-teal-400',
    badge: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  },
  confirmed: {
    label: 'Confirmed',
    bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-red-500/15 text-red-400 border-red-500/30',
    dot: 'bg-red-400',
    badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    dot: 'bg-gray-400',
    badge: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
  },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

// ─── Appointment Detail Modal ─────────────────────────────────────────────────

function AppointmentDetailModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const cfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG.scheduled;
  const start = parseISO(appointment.start_time);
  const end = parseISO(appointment.end_time);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-border bg-card">
        {/* Header strip */}
        <div className="relative px-6 py-5 border-b border-border bg-muted/30">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-base leading-tight">
                {appointment.patient_name}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">{appointment.reason}</p>
            </div>
          </div>
          <span className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <DetailRow icon={<Calendar className="h-4 w-4" />} label="Date">
            {format(start, 'EEEE, MMMM d, yyyy')}
          </DetailRow>
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Time">
            {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
          </DetailRow>
          {appointment.patient_phone && (
            <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone">
              {appointment.patient_phone}
            </DetailRow>
          )}
          {appointment.patient_email && (
            <DetailRow icon={<Tag className="h-4 w-4" />} label="Email">
              {appointment.patient_email}
            </DetailRow>
          )}
          <DetailRow icon={<Stethoscope className="h-4 w-4" />} label="Source">
            <span className="capitalize">{appointment.source.replace('_', ' ')}</span>
          </DetailRow>
          {appointment.notes && (
            <DetailRow icon={<FileText className="h-4 w-4" />} label="Notes">
              <span className="text-foreground/80">{appointment.notes}</span>
            </DetailRow>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}

// ─── Day All-Appointments Modal ───────────────────────────────────────────────

function DayAppointmentsModal({
  date,
  appointments,
  onClose,
  onSelect,
}: {
  date: Date;
  appointments: Appointment[];
  onClose: () => void;
  onSelect: (a: Appointment) => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border border-border bg-card">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{format(date, 'EEEE')}</p>
            <h2 className="font-semibold text-foreground">{format(date, 'MMMM d, yyyy')}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {appointments.map((a) => {
            const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
            return (
              <button
                key={a.id}
                onClick={() => { onClose(); onSelect(a); }}
                className="w-full text-left px-5 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
              >
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{a.patient_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.reason}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {format(parseISO(a.start_time), 'h:mm a')}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Appointment Modal ────────────────────────────────────────────────────

function NewAppointmentModal({ onClose }: { onClose: () => void }) {
  const createAppt = useCreateAppointment();
  const [form, setForm] = useState({
    patient_name: '',
    patient_phone: '',
    reason: '',
    start_time: '',
    notes: '',
  });

  const submit = async () => {
    if (!form.patient_name || !form.reason || !form.start_time) return;
    const start = new Date(form.start_time);
    const end = new Date(start.getTime() + 60 * 60000);
    await createAppt.mutateAsync({
      patient_name: form.patient_name,
      patient_phone: form.patient_phone,
      reason: form.reason,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      source: 'manual',
      notes: form.notes,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md border border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {[
            { label: 'Patient Name *', key: 'patient_name', type: 'text' },
            { label: 'Phone', key: 'patient_phone', type: 'tel' },
            { label: 'Service / Reason *', key: 'reason', type: 'text' },
            { label: 'Date & Time *', key: 'start_time', type: 'datetime-local' },
            { label: 'Notes', key: 'notes', type: 'text' },
          ].map(({ label, key, type }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                type={type}
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={createAppt.isPending}>
            {createAppt.isPending ? 'Saving…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Calendar Cell ────────────────────────────────────────────────────────────

function CalendarDay({
  day,
  currentMonth,
  appointments,
  onSelectAppt,
  onShowAll,
}: {
  day: Date;
  currentMonth: Date;
  appointments: Appointment[];
  onSelectAppt: (a: Appointment) => void;
  onShowAll: (day: Date, appts: Appointment[]) => void;
}) {
  const inMonth = isSameMonth(day, currentMonth);
  const today = isToday(day);
  const hidden = appointments.length > MAX_VISIBLE ? appointments.length - MAX_VISIBLE : 0;
  const visible = appointments.slice(0, MAX_VISIBLE);

  return (
    <div
      className={`
        min-h-[110px] p-1.5 border-b border-r border-border flex flex-col gap-1
        ${!inMonth ? 'bg-muted/20' : 'bg-card'}
      `}
    >
      {/* Day number */}
      <div className="flex items-center justify-end px-1">
        <span
          className={`
            text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full
            ${today
              ? 'bg-primary text-primary-foreground font-bold'
              : inMonth
              ? 'text-foreground'
              : 'text-muted-foreground/40'
            }
          `}
        >
          {format(day, 'd')}
        </span>
      </div>

      {/* Events */}
      <div className="flex flex-col gap-0.5 flex-1">
        {visible.map((a) => {
          const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
          return (
            <button
              key={a.id}
              onClick={() => onSelectAppt(a)}
              title={`${a.patient_name} — ${a.reason}`}
              className={`
                w-full text-left text-[10px] leading-tight font-medium px-1.5 py-0.5 rounded
                truncate border transition-opacity hover:opacity-80
                ${cfg.bg}
              `}
            >
              <span className="flex items-center gap-1 truncate">
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <span className="truncate">
                  {format(parseISO(a.start_time), 'h:mm a')} {a.patient_name}
                </span>
              </span>
            </button>
          );
        })}

        {hidden > 0 && (
          <button
            onClick={() => onShowAll(day, appointments)}
            className="text-[10px] font-medium text-primary hover:text-primary/80 px-1.5 py-0.5 text-left transition-colors"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user } = useAuthStore();
  useRealtimeSync(user?.organization_id ?? null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [dayModalData, setDayModalData] = useState<{ date: Date; appts: Appointment[] } | null>(null);
  const [showNew, setShowNew] = useState(false);

  // Fetch appointments for current month (+ a small buffer)
  const startDate = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }).toISOString();
  const endDate = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }).toISOString();

  const { data: appointments, isLoading } = useAppointments({
    start_date: startDate,
    end_date: endDate,
  });

  // Build a map of day-key → appointments[]
  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    (appointments ?? []).forEach((a) => {
      const key = format(parseISO(a.start_time), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [appointments]);

  // Build the 6-week grid
  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    const days: Date[] = [];
    let cursor = start;
    while (cursor <= end) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [currentMonth]);

  // Stats
  const totalThisMonth = (appointments ?? []).filter(
    (a) => isSameMonth(parseISO(a.start_time), currentMonth) && a.status !== 'cancelled'
  ).length;

  const todayAppts = (appointments ?? []).filter((a) => isToday(parseISO(a.start_time)));

  return (
    <div className="space-y-6 pb-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalThisMonth} appointment{totalThisMonth !== 1 ? 's' : ''} this month
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Appointment
        </Button>
      </div>

      {/* Stats row */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
            const count = (appointments ?? []).filter(
              (a) =>
                a.status === status &&
                isSameMonth(parseISO(a.start_time), currentMonth)
            ).length;
            return (
              <div
                key={status}
                className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3"
              >
                <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground capitalize">{cfg.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
              className="h-8 w-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold min-w-[160px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <button
              onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
              className="h-8 w-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="text-xs"
          >
            Today
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-border last:border-r-0"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }).map((_, i) => (
              <Skeleton key={i} className="h-[110px] rounded-none" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const appts = (apptsByDay.get(key) ?? []).sort(
                (a, b) =>
                  new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
              );
              return (
                <CalendarDay
                  key={key}
                  day={day}
                  currentMonth={currentMonth}
                  appointments={appts}
                  onSelectAppt={setSelectedAppt}
                  onShowAll={(d, a) => setDayModalData({ date: d, appts: a })}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Today's appointments strip */}
      {todayAppts.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Today's Appointments</h3>
          </div>
          <div className="divide-y divide-border">
            {todayAppts
              .sort(
                (a, b) =>
                  new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
              )
              .map((a) => {
                const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAppt(a)}
                    className="w-full text-left px-5 py-3 hover:bg-muted/50 transition-colors flex items-center gap-4"
                  >
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{a.reason}</p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {format(parseISO(a.start_time), 'h:mm a')}
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(STATUS_CONFIG).map(([, cfg]) => (
          <div key={cfg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        ))}
      </div>

      {/* Modals */}
      {selectedAppt && (
        <AppointmentDetailModal
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
        />
      )}
      {dayModalData && (
        <DayAppointmentsModal
          date={dayModalData.date}
          appointments={dayModalData.appts}
          onClose={() => setDayModalData(null)}
          onSelect={(a) => { setDayModalData(null); setSelectedAppt(a); }}
        />
      )}
      {showNew && <NewAppointmentModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
