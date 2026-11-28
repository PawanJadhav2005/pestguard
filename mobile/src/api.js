import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { io } from 'socket.io-client';

const DEFAULT_URL = Constants.expoConfig?.extra?.apiUrl || 'http://192.168.1.10:4000';
let baseUrl = DEFAULT_URL;
let token = null;
let onUnauthorized = () => {};
const bus = new Map(); // live-update and status events for screens

export const session = {
  async load() {
    baseUrl = (await SecureStore.getItemAsync('pg_server')) || DEFAULT_URL;
    token = await SecureStore.getItemAsync('pg_token');
    return { token, baseUrl };
  },
  async setServer(url) { baseUrl = url.replace(/\/+$/, ''); await SecureStore.setItemAsync('pg_server', baseUrl); },
  async setToken(t) { token = t; if (t) await SecureStore.setItemAsync('pg_token', t); else await SecureStore.deleteItemAsync('pg_token'); },
  get baseUrl() { return baseUrl; },
  get token() { return token; },
  onUnauthorized(fn) { onUnauthorized = fn; }
};

// ---- Waking a sleeping server ----
// The free Render server sleeps after 15 minutes without use and needs about a minute to start.
// While it starts, Render answers with a "waking up" page (502/503/504, not JSON) or the connection
// fails. Instead of showing an error, keep retrying for up to 2 minutes and tell the screen we're waiting.
const WAKE_MAX_MS = 120000;
let waking = false;
function setWaking(v) { if (waking !== v) { waking = v; bus.get('server:waking')?.forEach(fn => fn(v)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}
// GET requests also retry on network errors. POSTs only retry when the server clearly wasn't up
// (a waking-up page), so a report or booking is never sent twice.
async function fetchWaking(url, opts = {}) {
  const start = Date.now();
  const canRetryNetwork = !opts.method || opts.method === 'GET';
  for (let attempt = 0; ; attempt++) {
    let res = null, netErr = null;
    try { res = await fetchTimeout(url, opts, 30000); } catch (e) { netErr = e; }
    const ct = res?.headers?.get('content-type') || '';
    const asleep = res ? ([502, 503, 504].includes(res.status) && !ct.includes('application/json')) : canRetryNetwork;
    if (!asleep) { setWaking(false); if (netErr) throw netErr; return res; }
    if (Date.now() - start > WAKE_MAX_MS) { setWaking(false); if (netErr) throw netErr; return res; }
    setWaking(true);
    await sleep(attempt < 3 ? 2000 : 4000);
  }
}
// Call on app start so the server begins waking while the person is still on the first screen
export function wakeServer() { fetchWaking(`${baseUrl}/api/ping`).catch(() => {}); }

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetchWaking(`${baseUrl}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error(`Cannot reach the server at ${baseUrl}. Check your internet connection and try again.`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new Error(data.error || ([502, 503, 504].includes(res.status) ? 'The server is still starting. Please try again in a minute.' : `Request failed (${res.status})`));
  return data;
}

// Upload a photo or signature file. Returns the server's file name.
export async function uploadFile(uri, mimeType = 'image/jpeg') {
  const form = new FormData();
  form.append('file', { uri, name: mimeType === 'image/png' ? 'photo.png' : 'photo.jpg', type: mimeType });
  let res;
  try {
    res = await fetchWaking(`${baseUrl}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  } catch { throw new Error('Upload failed. Check your internet connection.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.file;
}

// Live updates: one socket and a small event bus every screen can listen to
let socket = null;
export function onLive(event, fn) { if (!bus.has(event)) bus.set(event, new Set()); bus.get(event).add(fn); return () => bus.get(event).delete(fn); }
export function connectLive() {
  socket?.disconnect();
  socket = io(baseUrl, { auth: { token }, transports: ['websocket'] });
  socket.onAny((e, p) => bus.get(e)?.forEach(fn => fn(p)));
  return socket;
}
export function disconnectLive() { socket?.disconnect(); socket = null; }
