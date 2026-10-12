import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BrandInput, CreatePageInput, OccasionInput, SiteSettings } from '../contracts';
import { api } from './api';
import type {
  AppConfig,
  AuditEntry,
  Brand,
  Media,
  Occasion,
  PageDetail,
  PageListItem,
  Paginated,
  Revision,
  Template,
  User,
} from './types';

export const qk = {
  config: ['config'] as const,
  pages: (f?: object) => ['pages', f ?? {}] as const,
  page: (id: string) => ['page', id] as const,
  revisions: (id: string) => ['page', id, 'revisions'] as const,
  brands: (f?: object) => ['brands', f ?? {}] as const,
  brandsByIds: (ids: string[]) => ['brands', 'ids', ids] as const,
  categories: ['brands', 'categories'] as const,
  media: (f?: object) => ['media', f ?? {}] as const,
  occasions: ['occasions'] as const,
  templates: (occasionId?: string) => ['templates', occasionId ?? 'all'] as const,
  site: ['site'] as const,
  users: ['users'] as const,
  audit: (f?: object) => ['audit', f ?? {}] as const,
};

/* ---------- reads ---------- */
export const useConfig = () =>
  useQuery({ queryKey: qk.config, queryFn: () => api.get<AppConfig>('/config'), staleTime: Infinity });

export const usePages = (f: { status?: string; occasionId?: string; search?: string }) =>
  useQuery({
    queryKey: qk.pages(f),
    queryFn: () => api.get<{ items: PageListItem[] }>('/pages', f).then((r) => r.items),
    placeholderData: keepPreviousData,
  });

export const usePage = (id: string) =>
  useQuery({ queryKey: qk.page(id), queryFn: () => api.get<{ page: PageDetail }>(`/pages/${id}`).then((r) => r.page) });

export const useRevisions = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.revisions(id),
    queryFn: () => api.get<{ items: Revision[] }>(`/pages/${id}/revisions`).then((r) => r.items),
    enabled,
  });

export const useBrands = (f: { search?: string; category?: string; active?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: qk.brands(f),
    queryFn: () => api.get<Paginated<Brand>>('/brands', f),
    placeholderData: keepPreviousData,
  });

export const useBrandsByIds = (ids: string[]) => {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: qk.brandsByIds(sorted),
    queryFn: () => api.get<Paginated<Brand>>('/brands', { ids: sorted.join(',') }).then((r) => r.items),
    enabled: sorted.length > 0,
    staleTime: 60_000,
  });
};

export const useBrandCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: () => api.get<{ items: string[] }>('/brands/categories').then((r) => r.items) });

export const useMedia = (f: { search?: string; page?: number; pageSize?: number }) =>
  useQuery({ queryKey: qk.media(f), queryFn: () => api.get<Paginated<Media>>('/media', f), placeholderData: keepPreviousData });

export const useOccasions = () =>
  useQuery({ queryKey: qk.occasions, queryFn: () => api.get<{ items: Occasion[] }>('/occasions').then((r) => r.items) });

export const useTemplates = (occasionId?: string) =>
  useQuery({
    queryKey: qk.templates(occasionId),
    queryFn: () => api.get<{ items: Template[] }>('/templates', { occasionId }).then((r) => r.items),
  });

export const useSiteSettings = () =>
  useQuery({ queryKey: qk.site, queryFn: () => api.get<{ settings: SiteSettings }>('/settings/site').then((r) => r.settings) });

export const useUsers = () =>
  useQuery({ queryKey: qk.users, queryFn: () => api.get<{ items: User[] }>('/users').then((r) => r.items) });

export const useAudit = (f: { page: number }) =>
  useQuery({ queryKey: qk.audit(f), queryFn: () => api.get<Paginated<AuditEntry>>('/audit', { ...f, pageSize: 50 }), placeholderData: keepPreviousData });

/* ---------- writes ---------- */
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: readonly unknown[][]) => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useCreatePage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePageInput) => api.post<{ page: PageDetail }>('/pages', input).then((r) => r.page),
    onSuccess: () => invalidate(['pages']),
  });
}

/** Any page lifecycle action that returns the updated page. */
export function usePageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown }) =>
      api.post<{ page: PageDetail }>(`/pages/${id}/${action}`, body ?? {}).then((r) => r.page),
    onSuccess: (page) => {
      qc.setQueryData(qk.page(page.id), page);
      void qc.invalidateQueries({ queryKey: ['pages'] });
      void qc.invalidateQueries({ queryKey: qk.revisions(page.id) });
    },
  });
}

export function useDeletePage() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/pages/${id}`), onSuccess: () => invalidate(['pages']) });
}

export function useSaveBrand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: BrandInput }) =>
      (id ? api.put<{ brand: Brand }>(`/brands/${id}`, input) : api.post<{ brand: Brand }>('/brands', input)).then((r) => r.brand),
    onSuccess: () => invalidate(['brands']),
  });
}

export function useDeleteBrand() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/brands/${id}`), onSuccess: () => invalidate(['brands']) });
}

export function useImportBrands() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<{ created: number; updated: number; errors: { row: number; message: string }[] }>('/brands/import', form);
    },
    onSuccess: () => invalidate(['brands']),
  });
}

export function useUploadMedia() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ file, alt }: { file: File; alt?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (alt) form.append('alt', alt);
      return api.upload<{ media: Media }>('/media', form).then((r) => r.media);
    },
    onSuccess: () => invalidate(['media']),
  });
}

export function useDeleteMedia() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/media/${id}`), onSuccess: () => invalidate(['media']) });
}

export function useSaveOccasion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: OccasionInput }) =>
      (id ? api.put<{ occasion: Occasion }>(`/occasions/${id}`, input) : api.post<{ occasion: Occasion }>('/occasions', input)).then(
        (r) => r.occasion,
      ),
    onSuccess: () => invalidate(qk.occasions as unknown as unknown[]),
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete(`/templates/${id}`), onSuccess: () => invalidate(['templates']) });
}

export function useSaveSiteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteSettings) => api.put<{ settings: SiteSettings }>('/settings/site', input).then((r) => r.settings),
    onSuccess: (s) => qc.setQueryData(qk.site, s),
  });
}

export function useSaveUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Record<string, unknown> }) =>
      (id ? api.put<{ user: User }>(`/users/${id}`, input) : api.post<{ user: User }>('/users', input)).then((r) => r.user),
    onSuccess: () => invalidate(qk.users as unknown as unknown[]),
  });
}
