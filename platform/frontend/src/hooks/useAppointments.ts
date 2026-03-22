import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Appointment, ApiResponse } from '@/types';
import { toast } from '@/hooks/use-toast';

interface AppointmentFilters {
  clinic_id?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
}

export function useAppointments(filters: AppointmentFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });

  return useQuery({
    queryKey: ['appointments', filters],
    queryFn: () =>
      api.get<ApiResponse<Appointment[]>>(`/api/appointments?${params.toString()}`).then((r) => r.data),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Appointment>) =>
      api.post<ApiResponse<Appointment>>('/api/appointments', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Appointment created' });
    },
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Appointment> & { id: string }) =>
      api.put<ApiResponse<Appointment>>(`/api/appointments/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Appointment updated' });
    },
  });
}
