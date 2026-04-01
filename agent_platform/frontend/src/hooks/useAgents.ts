import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Agent, ApiResponse } from '@/types';
import { toast } from '@/hooks/use-toast';

export function useAgents() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<ApiResponse<Agent[]>>('/api/agents').then((r) => r.data),
  });

  // Poll deploying agents every 5s until they resolve
  const deployingAgents = (query.data ?? []).filter((a) => a.status === 'deploying');
  useQuery({
    queryKey: ['agents-deploy-poll'],
    queryFn: async () => {
      await Promise.all(
        deployingAgents.map((a) =>
          api.get<{ status: string; deploy_progress: number | null; deploy_error: string | null }>(
            `/api/agents/${a.id}/status`
          ).then((res) => {
            if (res.status !== 'deploying') {
              qc.invalidateQueries({ queryKey: ['agents'] });
              qc.invalidateQueries({ queryKey: ['agents', a.id] });
              if (res.status === 'live') {
                toast({ title: `${a.name} is live!`, description: 'Your agent is ready to take calls.' });
              } else if (res.status === 'error') {
                toast({ title: `Deploy failed for ${a.name}`, description: res.deploy_error ?? 'Unknown error', variant: 'destructive' });
              }
            } else {
              qc.setQueryData<Agent[]>(['agents'], (prev) =>
                prev?.map((ag) => ag.id === a.id ? { ...ag, deploy_progress: res.deploy_progress ?? ag.deploy_progress } : ag)
              );
            }
          }).catch(() => null)
        )
      );
      return null;
    },
    enabled: deployingAgents.length > 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  return query;
}

export function usePublishAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      api.post<{ agent_id: string; status: string }>(`/api/agents/${agentId}/publish-async`, {}),
    onSuccess: (_, agentId) => {
      // Optimistically mark the agent as deploying so polling starts immediately
      qc.setQueryData<Agent[]>(['agents'], (prev) =>
        prev?.map((a) => a.id === agentId ? { ...a, status: 'deploying' as const, deploy_progress: 5 } : a)
      );
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
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
      toast({ title: 'Agent deleted', description: 'Server and telephony resources have been released.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
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
