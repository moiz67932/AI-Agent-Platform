import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PhoneNumber, ApiResponse } from '@/types';
import { toast } from '@/hooks/use-toast';

export function usePhoneNumbers() {
  return useQuery({
    queryKey: ['phone-numbers'],
    queryFn: () => api.get<ApiResponse<PhoneNumber[]>>('/api/numbers').then((r) => r.data),
  });
}

export function useProvisionNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { phone_number: string; label?: string; agent_id?: string }) =>
      api.post<ApiResponse<PhoneNumber>>('/api/numbers/provision', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phone-numbers'] });
      toast({ title: 'Number added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to add number', description: err.message, variant: 'destructive' });
    },
  });
}

export function useReleaseNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/numbers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['phone-numbers'] });
      toast({ title: 'Number removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to remove number', description: err.message, variant: 'destructive' });
    },
  });
}
