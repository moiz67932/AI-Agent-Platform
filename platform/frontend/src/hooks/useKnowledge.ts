import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { KnowledgeArticle, ApiResponse } from '@/types';
import { toast } from '@/hooks/use-toast';

export function useKnowledge(clinicId: string) {
  return useQuery({
    queryKey: ['knowledge', clinicId],
    queryFn: () => api.get<ApiResponse<KnowledgeArticle[]>>(`/api/knowledge/${clinicId}`).then((r) => r.data),
    enabled: !!clinicId,
  });
}

export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clinicId, ...data }: Partial<KnowledgeArticle> & { clinicId: string }) =>
      api.post<ApiResponse<KnowledgeArticle>>(`/api/knowledge/${clinicId}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['knowledge', vars.clinicId] });
      toast({ title: 'Article created' });
    },
  });
}

export function useUpdateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clinicId, id, ...data }: Partial<KnowledgeArticle> & { clinicId: string; id: string }) =>
      api.put<ApiResponse<KnowledgeArticle>>(`/api/knowledge/${clinicId}/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['knowledge', vars.clinicId] });
      toast({ title: 'Article updated' });
    },
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clinicId, id }: { clinicId: string; id: string }) =>
      api.delete(`/api/knowledge/${clinicId}/${id}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['knowledge', vars.clinicId] });
      toast({ title: 'Article deleted' });
    },
  });
}
