import { webConfig } from '../config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Request failed (${response.status}). Please try again.`;
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}
async function request(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${webConfig.apiBaseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      'We could not reach HealthWallet. Check your connection and try again. If you submitted a request, check its status before retrying.',
    );
  }
}
export async function apiGet<T>(path: string): Promise<T> {
  return readResponse<T>(await request(path, { credentials: 'include' }));
}
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return readResponse<T>(
    await request(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return readResponse<T>(
    await request(path, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return readResponse<T>(
    await request(path, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
export async function apiDelete<T>(path: string): Promise<T> {
  return readResponse<T>(await request(path, { method: 'DELETE', credentials: 'include' }));
}
