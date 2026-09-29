export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

/** JSON request to this app's own API. Throws ApiError with the server's message on failure. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText, data?.issues);
  return data as T;
}
