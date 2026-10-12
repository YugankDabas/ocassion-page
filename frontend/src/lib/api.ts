/**
 * Thin HTTP client for the admin API. Handles the session cookie (credentials),
 * the CSRF header for mutations, JSON (de)serialisation and error mapping.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Flattened zod field errors, when the server returned them. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return d?.fieldErrors ?? {};
  }

  /** Human-readable list of problems (validation details included). */
  get problems(): string[] {
    const d = this.details as { problems?: string[]; formErrors?: string[]; fieldErrors?: Record<string, string[]> } | undefined;
    if (!d) return [];
    return [
      ...(d.problems ?? []),
      ...(d.formErrors ?? []),
      ...Object.entries(d.fieldErrors ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`),
    ];
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class ApiClient {
  private csrfToken: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  constructor(private readonly baseUrl: string) {}

  setCsrfToken(token: string | null) {
    this.csrfToken = token;
  }

  /** For the rare plain form post (the preview iframe); everything else goes through `request`. */
  getCsrfToken(): string {
    return this.csrfToken ?? '';
  }

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  get<T>(path: string, query?: Query) {
    return this.request<T>('GET', path + toQueryString(query));
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T = void>(path: string) {
    return this.request<T>('DELETE', path);
  }

  upload<T>(path: string, form: FormData) {
    return this.request<T>('POST', path, form);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (method !== 'GET' && this.csrfToken) headers['x-csrf-token'] = this.csrfToken;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { method, headers, body: payload, credentials: 'include' });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
    }

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data?.error ?? {};
      if (res.status === 401 && !path.startsWith('/auth/login')) this.onUnauthorized?.();
      throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? `Request failed (${res.status})`, err.details);
    }
    return data as T;
  }
}

function toQueryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Defaults to the same-origin dev proxy; production can point at the separate API host. */
export const API_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;
export const api = new ApiClient(API_BASE);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const extra = err.problems.slice(0, 4);
    return extra.length ? `${err.message}: ${extra.join('; ')}` : err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
