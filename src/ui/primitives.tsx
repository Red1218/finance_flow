import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
} from 'react-native';
import { colors, fonts, radius, shadow, spacing } from '../theme/tokens';

// ---- Typography -----------------------------------------------------------

export function K({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.k, style]} />;
}

export function Num({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.num, style]} />;
}

export function Heading({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.heading, style]} />;
}

export function Body({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.body, style]} />;
}

export function Muted({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.body, styles.muted, style]} />;
}

// ---- Button -----------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  block,
  disabled,
  loading,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        buttonStyles.base,
        variant === 'primary' && buttonStyles.primary,
        variant === 'secondary' && buttonStyles.secondary,
        variant === 'ghost' && buttonStyles.ghost,
        block && buttonStyles.block,
        pressed && { opacity: 0.85 },
        (disabled || loading) && buttonStyles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.accent} />
      ) : (
        <Text
          style={[
            buttonStyles.text,
            variant === 'primary' && buttonStyles.textPrimary,
            variant === 'ghost' && buttonStyles.textGhost,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({ onPress, children, label }: { onPress?: () => void; children: React.ReactNode; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [buttonStyles.base, buttonStyles.icon, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

// ---- Tag -----------------------------------------------------------

type TagVariant = 'accent' | 'accent2' | 'neutral' | 'outline';

export function Tag({ label, variant = 'neutral' }: { label: string; variant?: TagVariant }) {
  return (
    <View
      style={[
        tagStyles.base,
        variant === 'accent' && tagStyles.accent,
        variant === 'accent2' && tagStyles.accent2,
        variant === 'neutral' && tagStyles.neutral,
        variant === 'outline' && tagStyles.outline,
      ]}
    >
      <Text
        style={[
          tagStyles.text,
          variant === 'accent' && { color: colors.accent800 },
          variant === 'accent2' && { color: colors.accent2_800 },
          variant === 'neutral' && { color: colors.neutral800 },
          variant === 'outline' && { color: colors.accent },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ---- Bar (progress) -----------------------------------------------------------

export function Bar({ pct, color, height = 5 }: { pct: number; color?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={[barStyles.track, { height, borderRadius: height / 2 }]}>
      <View style={[barStyles.fill, { width: `${clamped}%`, backgroundColor: color ?? colors.accent, borderRadius: height / 2 }]} />
    </View>
  );
}

// ---- Chip -----------------------------------------------------------

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[chipStyles.base, active && chipStyles.active]}
    >
      <Text style={[chipStyles.text, active && chipStyles.textActive]}>{label}</Text>
    </Pressable>
  );
}

// ---- Segmented control -----------------------------------------------------------

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={segStyles.row}>
      {options.map((opt, i) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[segStyles.opt, i > 0 && segStyles.optBorder, opt.value === value && segStyles.optActive]}
        >
          <Text style={[segStyles.text, opt.value === value && segStyles.textActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---- Input -----------------------------------------------------------

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.neutral600} {...props} style={[inputStyles.base, props.style]} />;
}

// ---- Card -----------------------------------------------------------

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[cardStyles.base, style]} />;
}

// ---- Divider -----------------------------------------------------------

export function Divider({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ height: 1, backgroundColor: colors.divider }, style]} />;
}

// ---- Screen header -----------------------------------------------------------

export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={headerStyles.row}>
      <Heading style={headerStyles.title}>{title}</Heading>
      {right}
    </View>
  );
}

// ---- styles -----------------------------------------------------------

const styles = StyleSheet.create({
  k: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.neutral600,
  },
  num: {
    fontFamily: fonts.body,
    fontVariant: ['tabular-nums'],
  },
  heading: {
    fontFamily: fonts.heading,
    color: colors.text,
    fontSize: 20,
  },
  body: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21,
  },
  muted: {
    color: colors.neutral700,
  },
});

const buttonStyles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flexDirection: 'row',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.divider, backgroundColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
  icon: { width: 44, paddingHorizontal: 0, borderWidth: 1, borderColor: colors.divider },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
  text: { fontFamily: fonts.heading, fontSize: 14.5, color: colors.text },
  textPrimary: { color: colors.bg },
  textGhost: { color: colors.accent },
});

const tagStyles = StyleSheet.create({
  base: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  accent: { backgroundColor: colors.accent100 },
  accent2: { backgroundColor: colors.accent2_100 },
  neutral: { backgroundColor: colors.neutral100 },
  outline: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'transparent' },
  text: { fontFamily: fonts.body, fontSize: 11 },
});

const barStyles = StyleSheet.create({
  track: { backgroundColor: colors.neutral300, overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
});

const chipStyles = StyleSheet.create({
  base: {
    paddingHorizontal: 14,
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { borderColor: colors.accent, backgroundColor: colors.accent100 },
  text: { fontFamily: fonts.body, fontSize: 12.5, color: colors.neutral700 },
  textActive: { color: colors.accent700, fontFamily: fonts.heading },
});

const segStyles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, overflow: 'hidden' },
  opt: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  optBorder: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  optActive: { backgroundColor: colors.accent },
  text: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  textActive: { color: colors.bg, fontFamily: fonts.heading },
});

const inputStyles = StyleSheet.create({
  base: {
    minHeight: 40,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
});

const cardStyles = StyleSheet.create({
  base: {
    padding: spacing.s3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: spacing.s2,
    ...shadow.sm,
  },
});

const headerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 18 },
});
