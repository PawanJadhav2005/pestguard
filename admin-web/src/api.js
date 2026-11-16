import { io } from 'socket.io-client';
const BASE = import.meta.env.VITE_API_URL || '';
let token = sessionStorage.getItem('pg_token');
let onUnauthorized = () => {};

export const auth = {
  get token() { return token; },
  set(t) { token = t; t ? sessionStorage.setItem('pg_token', t) : sessionStorage.removeItem('pg_token'); },
  onUnauthorized(fn) { onUnauthorized = fn; }
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).catch(() => { throw new Error('Cannot reach the server. Check that it is running.'); });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Photos are protected, so fetch them with the token and show as a local blob
const blobCache = new Map();
export async function fileUrl(name) {
  if (!name) return null;
  if (blobCache.has(name)) return blobCache.get(name);
  const res = await fetch(`${BASE}/api/files/${name}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const url = URL.createObjectURL(await res.blob());
  blobCache.set(name, url);
  return url;
}

// Live updates: one socket, and a small event bus so any screen can listen
// even if it mounts before the socket connects.
let socket = null;
const bus = new Map();
export function on(event, fn) { if (!bus.has(event)) bus.set(event, new Set()); bus.get(event).add(fn); return () => bus.get(event).delete(fn); }
export function connectLive() {
  if (socket) socket.disconnect();
  socket = io(BASE || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
  socket.onAny((event, payload) => bus.get(event)?.forEach(fn => fn(payload)));
  ['connect', 'disconnect'].forEach(e => socket.on(e, () => bus.get(e)?.forEach(fn => fn())));
  return socket;
}
export const live = () => socket;
