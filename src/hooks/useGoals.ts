import { useLiveQuery } from './useLiveQuery';
import { listGoals } from '../data/repositories/goals';

export function useGoals() {
  return useLiveQuery(() => listGoals(), []);
}
