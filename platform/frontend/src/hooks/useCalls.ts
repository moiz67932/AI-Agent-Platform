import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CallSession, ApiResponse, PaginatedResponse } from '@/types';

interface CallFilters {
  agent_id?: string;
  outcome?: string;
  min_duration?: number;
  max_duration?: number;
  start_date?: string;
  end_date?: string;
  page?: number;
  per_page?: number;
}

export function useCalls(filters: CallFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });

  return useQuery({
    queryKey: ['calls', filters],
    queryFn: () =>
      api.get<PaginatedResponse<CallSession>>(`/api/calls?${params.toString()}`),
  });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: ['calls', id],
    queryFn: () => api.get<ApiResponse<CallSession>>(`/api/calls/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}
