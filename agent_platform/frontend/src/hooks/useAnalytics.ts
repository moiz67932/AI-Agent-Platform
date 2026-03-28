import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AnalyticsData, ApiResponse } from '@/types';

interface AnalyticsParams {
  start_date?: string;
  end_date?: string;
  agent_id?: string;
}

export function useAnalytics(params: AnalyticsParams = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) searchParams.set(k, v);
  });

  return useQuery({
    queryKey: ['analytics', params],
    queryFn: () =>
      api.get<ApiResponse<AnalyticsData>>(`/api/analytics?${searchParams.toString()}`).then((r) => r.data),
  });
}
