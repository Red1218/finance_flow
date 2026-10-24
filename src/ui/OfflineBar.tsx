import { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useConnection } from '../data/offline';
import { syncNow } from '../application/transactions';
import { caps, colors, spacing, themed } from '../theme/tokens';

function updatedLabel(at: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('en-IN', sameDay ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// A line above the tab bar while the app can't reach Supabase or has entries
// waiting to upload. It also drives the uploads: when the app comes to the
// front, and every 15s while offline or while entries wait.
export function OfflineBar() {
  const { offline, syncedAt, queued } = useConnection();

  useEffect(() => {
    syncNow();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!offline && queued === 0) return;
    const timer = setInterval(syncNow, 15000);
    return () => clearInterval(timer);
  }, [offline, queued]);

  if (!offline && queued === 0) return null;
  const parts = [
    offline ? `Offline${syncedAt ? ` · updated ${updatedLabel(syncedAt)}` : ''}` : null,
    queued ? `${queued} waiting to upload` : null,
  ].filter(Boolean);
  return (
    <View style={styles.bar} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{parts.join(' · ')}</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: {
      paddingVertical: 6,
      paddingHorizontal: spacing.s4,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    text: {
      ...caps,
      fontSize: 10,
      letterSpacing: 1.2,
      color: colors.muted,
      textAlign: 'center',
    },
  })
);
