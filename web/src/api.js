/** JSON calls to the Express API. Non-2xx responses throw Error(body.error) with the HTTP code in `status`. */
async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // Signed out (or the password changed): back to the login page, and here again afterwards.
  if (res.status === 401) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return new Promise(() => {});
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  send: (method, path, body) => request(method, path, body),
};
