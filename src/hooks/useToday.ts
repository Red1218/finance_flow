import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isSameDay } from '../domain/dateRange';

// Tab screens stay mounted, so a date captured once at mount goes stale at
// midnight. This rolls over at the next local midnight, or on returning to
// the app if the timer was paused while it was in the background.
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const rollIfNewDay = () => {
      const now = new Date();
      if (!isSameDay(now, today)) setToday(now);
    };
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const timer = setTimeout(rollIfNewDay, midnight.getTime() - Date.now() + 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') rollIfNewDay();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
