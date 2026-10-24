import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Offline support, deliberately small: the last successful result of each
// screen query is saved on the phone and shown when Supabase can't be
// reached. Supabase stays the source of truth — a saved copy is only ever
// read after a fetch has failed for lack of a connection.

const CACHE_PREFIX = 'financeflow.cache.';
const SYNCED_AT_KEY = 'financeflow.syncedAt';

// Fetch failures that mean "no connection", not "the server said no":
// supabase-js turns a failed fetch into an error whose message carries the
// fetch error's name and message ("TypeError: Network request failed"), and
// the client's timeout aborts a hung request ("AbortError: Aborted").
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (name === 'AbortError' || name === 'AuthRetryableFetchError') return true;
  return typeof message === 'string' && /network request failed|failed to fetch|aborterror|aborted/i.test(message);
}

export interface ConnectionState {
  offline: boolean;
  // When data last came from Supabase (ms), shown as "updated 4:56 pm".
  syncedAt: number | null;
  // Entries saved on the phone that are still waiting to upload.
  queued: number;
}

let state: ConnectionState = { offline: false, syncedAt: null, queued: 0 };
const listeners = new Set<() => void>();
const syncedListeners = new Set<() => void>();

function setState(patch: Partial<ConnectionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

AsyncStorage.getItem(SYNCED_AT_KEY)
  .then((v) => {
    if (v && state.syncedAt === null) setState({ syncedAt: Number(v) });
  })
  .catch(() => {});

// Returns true when it fired the synced event (the connection just came back).
export function markOnline(): boolean {
  const wasOffline = state.offline;
  const syncedAt = Date.now();
  setState({ offline: false, syncedAt });
  AsyncStorage.setItem(SYNCED_AT_KEY, String(syncedAt)).catch(() => {});
  if (wasOffline) notifySynced();
  return wasOffline;
}

export function markOffline() {
  if (!state.offline) setState({ offline: true });
}

export function setQueuedCount(queued: number) {
  if (queued !== state.queued) setState({ queued });
}

export function getConnection(): ConnectionState {
  return state;
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

// Fired when the connection comes back or queued entries finish uploading,
// so screens reload instead of waiting for the next focus.
export function notifySynced() {
  syncedListeners.forEach((l) => l());
}

export function onSynced(listener: () => void): () => void {
  syncedListeners.add(listener);
  return () => syncedListeners.delete(listener);
}

// ponytail: one AsyncStorage entry per query; Android caps an entry at ~2MB,
// so a few thousand transactions in the all-time list is the ceiling. Move to
// SQLite if the history outgrows it.
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => {});
}

// On sign-out: the next person to sign in on this phone mustn't see these.
export async function clearCache(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX) || k === SYNCED_AT_KEY);
  await AsyncStorage.multiRemove(keys);
  setState({ syncedAt: null });
}

// Random v4 UUID for rows created on the phone. Not security-sensitive: it
// only has to be unique, so Math.random is enough (Hermes has no crypto).
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
