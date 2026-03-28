import { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, parseISO,
} from 'date-fns';
import {
  Plus, ChevronLeft, ChevronRight, X, Calendar, Clock,
  User, Phone, FileText, Tag, Stethoscope,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppointments, useCreateAppointment } from '@/hooks/useAppointments';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/types';

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  scheduled:  { label: 'Scheduled',  dot: 'bg-dash-amber',  badge: 'bg-dash-amber-bg border-dash-amber-b text-dash-amber' },
  confirmed:  { label: 'Confirmed',  dot: 'bg-dash-green',  badge: 'bg-dash-green-bg border-dash-green-b text-dash-green' },
  cancelled:  { label: 'Cancelled',  dot: 'bg-dash-pink',   badge: 'bg-dash-pink-bg border-dash-pink-b text-dash-pink' },
  completed:  { label: 'Completed',  dot: 'bg-dash-t3',     badge: 'bg-dash-surface border-dash-border text-dash-t3' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

/* ── Appointment detail modal ── */
function AppointmentDetailModal({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const cfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG.scheduled;
  const start = parseISO(appointment.start_time);
  const end = parseISO(appointment.end_time);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-dash-border bg-dash-card">
        <div className="px-6 py-5 border-b border-dash-border">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-dash-blue-bg flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-dash-blue" />
            </div>
            <div>
              <h2 className="font-bold text-dash-t1">{appointment.patient_name}</h2>
              <p className="text-sm text-dash-t2 mt-0.5">{appointment.reason}</p>
            </div>
          </div>
          <span className={cn('mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border', cfg.badge)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
        </div>
        <div className="px-6 py-5 space-y-3">
          <DetailRow icon={<Calendar className="h-4 w-4" />} label="Date">{format(start, 'EEEE, MMMM d, yyyy')}</DetailRow>
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Time">{format(start, 'h:mm a')} – {format(end, 'h:mm a')}</DetailRow>
          {appointment.patient_phone && <DetailRow icon={<Phone className="h-4 w-4" />} label="Phone">{appointment.patient_phone}</DetailRow>}
          {appointment.patient_email && <DetailRow icon={<Tag className="h-4 w-4" />} label="Email">{appointment.patient_email}</DetailRow>}
          <DetailRow icon={<Stethoscope className="h-4 w-4" />} label="Source"><span className="capitalize">{appointment.source.replace('_', ' ')}</span></DetailRow>
          {appointment.notes && <DetailRow icon={<FileText className="h-4 w-4" />} label="Notes">{appointment.notes}</DetailRow>}
        </div>
        <div className="px-6 py-4 border-t border-dash-border flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs font-semibold px-4 py-2 rounded-lg border border-dash-border text-dash-t2 hover:text-dash-t1 transition-colors">Close</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-dash-t3 mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-dash-t3 mb-0.5">{label}</p>
        <p className="text-sm text-dash-t1">{children}</p>
      </div>
    </div>
  );
}

/* ── Day all-appointments modal ── */
function DayAppointmentsModal({ date, appointments, onClose, onSelect }: { date: Date; appointments: Appointment[]; onClose: () => void; onSelect: (a: Appointment) => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border border-dash-border bg-dash-card">
        <div className="px-5 py-4 border-b border-dash-border flex items-center justify-between">
          <div>
            <p className="text-[10px] text-dash-t3">{format(date, 'EEEE')}</p>
            <h2 className="font-bold text-dash-t1">{format(date, 'MMMM d, yyyy')}</h2>
          </div>
          <button onClick={onClose} className="text-dash-t3 hover:text-dash-t1"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-dash-border">
          {appointments.map(a => {
            const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
            return (
              <button key={a.id} onClick={() => { onClose(); onSelect(a); }} className="w-full text-left px-5 py-3 hover:bg-dash-surface transition-colors flex items-center gap-3">
                <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-dash-t1 truncate">{a.patient_name}</p>
                  <p className="text-xs text-dash-t2 truncate">{a.reason}</p>
                </div>
                <span className="text-xs text-dash-t3 shrink-0">{format(parseISO(a.start_time), 'h:mm a')}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── New appointment modal ── */
function NewAppointmentModal({ onClose }: { onClose: () => void }) {
  const createAppt = useCreateAppointment();
  const [form, setForm] = useState({ patient_name: '', patient_phone: '', reason: '', start_time: '', notes: '' });

  const submit = async () => {
    if (!form.patient_name || !form.reason || !form.start_time) return;
    const start = new Date(form.start_time);
    const end = new Date(start.getTime() + 60 * 60000);
    await createAppt.mutateAsync({
      patient_name: form.patient_name, patient_phone: form.patient_phone,
      reason: form.reason, start_time: start.toISOString(), end_time: end.toISOString(),
      status: 'scheduled', source: 'manual', notes: form.notes,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md border border-dash-border bg-dash-card">
        <DialogHeader><DialogTitle className="text-base font-bold text-dash-t1">New Appointment</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          {[
            { label: 'Patient Name *', key: 'patient_name', type: 'text' },
            { label: 'Phone', key: 'patient_phone', type: 'tel' },
            { label: 'Service / Reason *', key: 'reason', type: 'text' },
            { label: 'Date & Time *', key: 'start_time', type: 'datetime-local' },
            { label: 'Notes', key: 'notes', type: 'text' },
          ].map(({ label, key, type }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-medium text-dash-t2">{label}</label>
              <input
                type={type}
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full text-sm text-dash-t1 bg-dash-bg border border-dash-border rounded-lg px-3 py-2 outline-none focus:border-dash-blue transition-colors"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="text-xs font-semibold px-4 py-2 rounded-lg border border-dash-border text-dash-t2">Cancel</button>
          <button onClick={submit} disabled={createAppt.isPending} className="text-xs font-semibold px-4 py-2 rounded-lg bg-dash-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50">
            {createAppt.isPending ? 'Creating...' : 'Create Appointment'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main page ── */
export default function CalendarPage() {
  const { user } = useAuthStore();
  const orgId = user?.organization_id ?? null;
  useRealtimeSync(orgId);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [dayModal, setDayModal] = useState<{ date: Date; appointments: Appointment[] } | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const { data: appointments, isLoading } = useAppointments({ start_date: monthStart.toISOString(), end_date: monthEnd.toISOString() });

  const dayMap = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    (appointments || []).forEach(a => {
      const key = format(parseISO(a.start_time), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) || []), a]);
    });
    return map;
  }, [appointments]);

  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const calDays: Date[] = [];
  let d = calStart;
  while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }

  // Upcoming table data
  const upcoming = (appointments || [])
    .filter(a => a.status !== 'cancelled' && parseISO(a.start_time) >= new Date())
    .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-dash-t1">Appointments</h1>
          <p className="text-xs text-dash-t3 mt-0.5">{(appointments || []).length} appointments this month</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-dash-border overflow-hidden">
            <button onClick={() => setViewMode('month')} className={cn('text-xs font-semibold px-3 py-1.5', viewMode === 'month' ? 'bg-dash-blue text-white' : 'bg-dash-card text-dash-t2')}>Month</button>
            <button onClick={() => setViewMode('list')} className={cn('text-xs font-semibold px-3 py-1.5', viewMode === 'list' ? 'bg-dash-blue text-white' : 'bg-dash-card text-dash-t2')}>List</button>
          </div>
          <button onClick={() => setShowNewAppt(true)} className="inline-flex items-center gap-1.5 bg-dash-blue text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
      </div>

      {viewMode === 'month' ? (
        <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-dash-border">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-1 rounded-lg text-dash-t3 hover:bg-dash-surface transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-bold text-dash-t1">{format(currentMonth, 'MMMM yyyy')}</span>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-1 rounded-lg text-dash-t3 hover:bg-dash-surface transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>

          {/* Week headers */}
          <div className="grid grid-cols-7 border-b border-dash-border">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-label uppercase text-dash-t3 tracking-widest py-2">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          {isLoading ? (
            <div className="p-6"><Skeleton className="h-64 foyer-skeleton" /></div>
          ) : (
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayAppointments = dayMap.get(key) || [];
                const inMonth = isSameMonth(day, currentMonth);
                return (
                  <div
                    key={i}
                    className={cn(
                      'min-h-[90px] border-b border-r border-dash-border p-1.5 cursor-pointer hover:bg-dash-surface/50 transition-colors',
                      !inMonth && 'opacity-30'
                    )}
                    onClick={() => dayAppointments.length > MAX_VISIBLE && setDayModal({ date: day, appointments: dayAppointments })}
                  >
                    <span className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                      isToday(day) ? 'bg-dash-blue text-white' : 'text-dash-t1'
                    )}>{format(day, 'd')}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayAppointments.slice(0, MAX_VISIBLE).map(a => {
                        const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
                        return (
                          <button
                            key={a.id}
                            onClick={e => { e.stopPropagation(); setSelectedAppt(a); }}
                            className="w-full text-left flex items-center gap-1 px-1 py-0.5 rounded hover:bg-dash-surface transition-colors"
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
                            <span className="text-[9px] font-medium text-dash-t1 truncate">{a.patient_name}</span>
                          </button>
                        );
                      })}
                      {dayAppointments.length > MAX_VISIBLE && (
                        <span className="text-[9px] text-dash-blue font-semibold px-1">+{dayAppointments.length - MAX_VISIBLE} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* List view */
        <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dash-border bg-dash-surface">
                  {['Date/time', 'Patient', 'Service', 'Agent', 'Duration', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcoming.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-sm text-dash-t3">No upcoming appointments</td></tr>
                ) : upcoming.map(a => {
                  const start = parseISO(a.start_time);
                  const end = parseISO(a.end_time);
                  const dur = Math.round((end.getTime() - start.getTime()) / 60000);
                  const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
                  return (
                    <tr key={a.id} className="border-b border-dash-border last:border-0 hover:bg-dash-surface transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-semibold text-dash-t1">{format(start, 'EEE MMM d')}</p>
                        <p className="text-[10px] text-dash-t3">{format(start, 'h:mm a')}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-dash-blue-bg flex items-center justify-center text-[9px] font-bold text-dash-blue">
                            {a.patient_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <span className="text-sm text-dash-t1">{a.patient_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-dash-t2">{a.reason}</td>
                      <td className="px-4 py-2.5 text-xs text-dash-t2">{'\u2014'}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-dash-t3">{dur}min</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', cfg.badge)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setSelectedAppt(a)} className="text-xs text-dash-blue font-semibold hover:underline">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewAppt && <NewAppointmentModal onClose={() => setShowNewAppt(false)} />}
      {selectedAppt && <AppointmentDetailModal appointment={selectedAppt} onClose={() => setSelectedAppt(null)} />}
      {dayModal && <DayAppointmentsModal date={dayModal.date} appointments={dayModal.appointments} onClose={() => setDayModal(null)} onSelect={setSelectedAppt} />}
    </div>
  );
}
