import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParsedTransaction } from '../../domain/smsParsers/types';

const STORAGE_KEY = 'financeflow.pendingSmsDetections';

export interface PendingDetection extends ParsedTransaction {
  id: string;
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
  const existing = await readAll();
  if (existing.some((d) => d.id === detection.dedupKey)) return;
  existing.push({ ...detection, id: detection.dedupKey });
  await writeAll(existing);
}

export async function listDetections(): Promise<PendingDetection[]> {
  return readAll();
}

export async function removeDetection(id: string): Promise<void> {
  const existing = await readAll();
  await writeAll(existing.filter((d) => d.id !== id));
}
