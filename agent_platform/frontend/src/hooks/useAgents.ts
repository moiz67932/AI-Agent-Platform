import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Agent, ApiResponse } from '@/types';
import { toast } from '@/hooks/use-toast';

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<ApiResponse<Agent[]>>('/api/agents').then((r) => r.data),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => api.get<ApiResponse<Agent>>(`/api/agents/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Agent>) => api.post<ApiResponse<Agent>>('/api/agents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agent created' });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Agent> & { id: string }) =>
      api.put<ApiResponse<Agent>>(`/api/agents/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', vars.id] });
      toast({ title: 'Agent updated' });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast({ title: 'Agent deleted' });
    },
  });
}

export function useToggleAgentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/agents/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agents', vars.id] });
    },
  });
}
