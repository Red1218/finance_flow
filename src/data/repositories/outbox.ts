import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewTransaction } from './transactions';
import { setQueuedCount } from '../offline';

const STORAGE_KEY = 'financeflow.outbox';

// An expense or income saved while offline. `input.id` is the id the row
// gets in Supabase, so an upload that landed but whose reply was lost is
// recognised as already done on the next try.
export interface QueuedTransaction {
  input: NewTransaction & { id: string; occurredAt: string };
  // Set when Supabase refused it (not a connection problem); it is no
  // longer retried and waits for the user to discard it.
  error?: string;
}

async function readAll(): Promise<QueuedTransaction[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedTransaction[];
  } catch {
    return [];
  }
}

async function writeAll(items: QueuedTransaction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  setQueuedCount(items.length);
}

export async function listQueued(): Promise<QueuedTransaction[]> {
  const items = await readAll();
  setQueuedCount(items.length);
  return items;
}

export async function enqueue(input: QueuedTransaction['input']): Promise<void> {
  await writeAll([...(await readAll()).filter((q) => q.input.id !== input.id), { input }]);
}

export async function removeQueued(id: string): Promise<void> {
  await writeAll((await readAll()).filter((q) => q.input.id !== id));
}

export async function markQueuedFailed(id: string, error: string): Promise<void> {
  await writeAll((await readAll()).map((q) => (q.input.id === id ? { ...q, error } : q)));
}

export async function clearQueued(): Promise<void> {
  await writeAll([]);
}
