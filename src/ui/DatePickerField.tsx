import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isSameDay, monthGridDays } from '../domain/dateRange';
import { K } from './primitives';
import { colors, fonts, spacing } from '../theme/tokens';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Broadsheet Calendar Popup spec (turn 2, "1c built out"): a 7-day strip
// always visible at rest, expanding in place to a month grid or a
// month/year jump index — no native date-picker dependency, same
// tap-to-set-dateText contract the plain YYYY-MM-DD field it replaces used.
// Skipped: the mockup's optional "+ Add time" row — occurred_at's
// time-of-day always comes from combineLocalDateWithCurrentTime's `now`,
// and nothing in the domain layer supports a user-chosen time yet.
export function DatePickerField({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const today = useMemo(() => new Date(), []);
  const [expanded, setExpanded] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const strip = useMemo(() => {
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    return Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));
  }, [today]);

  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-IN', { month: 'short' })),
    []
  );
  const jumpYears = [visibleMonth.getFullYear() - 2, visibleMonth.getFullYear() - 1, visibleMonth.getFullYear(), visibleMonth.getFullYear() + 1];

  const pickDay = (d: Date) => {
    onChange(d);
    setExpanded(false);
  };

  const openExpanded = () => {
    setVisibleMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setJumpOpen(false);
    setExpanded(true);
  };

  const isToday = isSameDay(value, today);
  const dateLabel = value.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');

  return (
    <View style={styles.field}>
      <View style={styles.headRow}>
        <K>Date</K>
        <Pressable
          onPress={() => (expanded ? setExpanded(false) : openExpanded())}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
        >
          <Text style={styles.link}>{expanded ? 'Hide month ▴' : 'Full month ▾'}</Text>
        </Pressable>
      </View>

      <View style={styles.strip}>
        {strip.map((d) => {
          const selected = isSameDay(d, value);
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => pickDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={d.toDateString()}
              style={[styles.stripCell, selected && styles.stripCellSelected]}
            >
              <Text style={[styles.stripDow, selected && styles.stripDowSelected]}>
                {d.toLocaleDateString('en-IN', { weekday: 'short' })}
              </Text>
              <Text style={[styles.stripNum, selected && styles.stripNumSelected]}>{d.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summary}>
          {isToday ? 'Today, ' : ''}
          {dateLabel}
        </Text>
        {expanded && (
          <Pressable onPress={() => setJumpOpen((j) => !j)} hitSlop={8}>
            <Text style={styles.link}>{jumpOpen ? 'Close jump ›' : 'Jump to month ›'}</Text>
          </Pressable>
        )}
      </View>

      {expanded && !jumpOpen && (
        <View>
          <View style={styles.monthHeadRow}>
            <Text style={styles.monthHead}>{visibleMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>
            <View style={styles.monthNav}>
              <Pressable
                onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                style={styles.navBtn}
              >
                <Text style={styles.navBtnText}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                accessibilityRole="button"
                accessibilityLabel="Next month"
                style={styles.navBtn}
              >
                <Text style={styles.navBtnText}>›</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.weekLabels}>
            {WEEKDAY_LETTERS.map((w, i) => (
              <Text key={i} style={styles.weekLabel}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {monthGridDays(visibleMonth.getFullYear(), visibleMonth.getMonth()).map(({ date, inMonth }) => {
              const selected = isSameDay(date, value);
              const isTodayCell = !selected && isSameDay(date, today);
              return (
                <Pressable
                  key={date.toISOString()}
                  onPress={() => pickDay(date)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={date.toDateString()}
                  style={[styles.dayCell, selected && styles.dayCellSelected, isTodayCell && styles.dayCellToday]}
                >
                  <Text style={[styles.dayText, !inMonth && styles.dayTextMuted, selected && styles.dayTextSelected]}>
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {expanded && jumpOpen && (
        <View style={{ gap: spacing.s3 }}>
          <View style={styles.jumpGrid}>
            {monthNames.map((label, i) => {
              const active = i === visibleMonth.getMonth();
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    setVisibleMonth(new Date(visibleMonth.getFullYear(), i, 1));
                    setJumpOpen(false);
                  }}
                  style={[styles.jumpCell, active && styles.jumpCellActive]}
                >
                  <Text style={[styles.jumpText, active && styles.jumpTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.jumpGrid}>
            {jumpYears.map((y) => {
              const active = y === visibleMonth.getFullYear();
              return (
                <Pressable
                  key={y}
                  onPress={() => {
                    setVisibleMonth(new Date(y, visibleMonth.getMonth(), 1));
                    setJumpOpen(false);
                  }}
                  style={[styles.jumpCell, active && styles.jumpCellActive]}
                >
                  <Text style={[styles.jumpText, active && styles.jumpTextActive]}>{y}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 9 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  link: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent700 },
  strip: { flexDirection: 'row', gap: 4 },
  stripCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  stripCellSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  stripDow: { fontFamily: fonts.body, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.neutral600 },
  stripDowSelected: { color: colors.bg },
  stripNum: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  stripNumSelected: { color: colors.bg },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  summary: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  monthHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthHead: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  monthNav: { flexDirection: 'row', gap: 6 },
  navBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 2,
  },
  navBtnText: { fontFamily: fonts.body, fontSize: 15, color: colors.accent700 },
  weekLabels: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 9.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.neutral600,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  dayCell: { width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 2 },
  dayCellSelected: { backgroundColor: colors.accent },
  dayCellToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  dayTextMuted: { color: colors.neutral400 },
  dayTextSelected: { color: colors.bg, fontFamily: fonts.heading },
  jumpGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  jumpCell: { width: `${100 / 4 - 1}%`, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 2 },
  jumpCellActive: { backgroundColor: colors.accent },
  jumpText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.text },
  jumpTextActive: { color: colors.bg, fontFamily: fonts.heading },
});
