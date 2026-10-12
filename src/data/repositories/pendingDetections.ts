import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedTransaction } from '../../domain/smsParsers/types';

const STORAGE_KEY = 'financeflow.pendingSmsDetections';

export interface PendingDetection extends ParsedTransaction {
  id: string;
  // Set when the user splits a suggested transfer pair back into two rows,
  // so the same pair isn't suggested again.
  notTransfer?: boolean;
}

async function readAll(): Promise<PendingDetection[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingDetection[];
  } catch {
    // A corrupted queue reads as empty rather than throwing on every call —
    // the next write overwrites it with valid JSON.
    return [];
  }
}

async function writeAll(items: PendingDetection[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function addDetection(detection: ParsedTransaction): Promise<void> {
  await addDetections([detection]);
}

// One read and one write for any number of detections (the SMS import can
// queue hundreds); duplicates of queued items are skipped.
export async function addDetections(detections: ParsedTransaction[]): Promise<void> {
  const existing = await readAll();
  const ids = new Set(existing.map((d) => d.id));
  for (const detection of detections) {
    if (ids.has(detection.dedupKey)) continue;
    ids.add(detection.dedupKey);
    existing.push({ ...detection, id: detection.dedupKey });
  }
  await writeAll(existing);
}

export async function listDetections(): Promise<PendingDetection[]> {
  return readAll();
}

export async function removeDetection(id: string): Promise<void> {
  const existing = await readAll();
  await writeAll(existing.filter((d) => d.id !== id));
}

export async function markNotTransfer(ids: string[]): Promise<void> {
  const marked = new Set(ids);
  const existing = await readAll();
  await writeAll(existing.map((d) => (marked.has(d.id) ? { ...d, notTransfer: true } : d)));
}
