import { useLiveQuery } from './useLiveQuery';
import { listCategories } from '../data/repositories/categories';
import type { CategoryKind } from '../data/types';

export function useCategories(kind?: CategoryKind) {
  return useLiveQuery(() => listCategories(kind), [kind]);
}
