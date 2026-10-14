import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { caps, colors, fonts, spacing } from '../theme/tokens';

const useNativeDriver = Platform.OS !== 'web';

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

// ---- Motion -----------------------------------------------------------

// Runs `start` unless the OS asks for reduced motion, in which case `skip`
// jumps straight to the end state.
function whenMotionAllowed(start: () => void, skip: () => void) {
  AccessibilityInfo.isReduceMotionEnabled()
    .then((reduce) => (reduce ? skip() : start()))
    .catch(start);
}

// Fades and lifts its children in once, on mount. Stagger siblings with `delay`.
export function Rise({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    whenMotionAllowed(
      () => Animated.timing(v, { toValue: 1, duration: 550, delay, easing: Easing.out(Easing.cubic), useNativeDriver }).start(),
      () => v.setValue(1)
    );
  }, [v, delay]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// Grows a bar from its base (vertical) or left edge (horizontal) on mount.
export function Grow({
  axis = 'x',
  delay = 0,
  style,
}: {
  axis?: 'x' | 'y';
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    whenMotionAllowed(
      () => Animated.timing(v, { toValue: 1, duration: 750, delay, easing: Easing.out(Easing.cubic), useNativeDriver }).start(),
      () => v.setValue(1)
    );
  }, [v, delay]);
  const transform = axis === 'x' ? [{ scaleX: v }] : [{ scaleY: v }];
  return <Animated.View style={[style, { transformOrigin: axis === 'x' ? 'left' : 'bottom', transform }]} />;
}

// Counts a number up from where it was to `target` (from 0 on first mount).
export function useCountUp(target: number, duration = 1000) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    let raf = 0;
    const from = shownRef.current;
    const set = (n: number) => {
      shownRef.current = n;
      setShown(n);
    };
    whenMotionAllowed(
      () => {
        const t0 = Date.now();
        const tick = () => {
          const p = Math.min(1, (Date.now() - t0) / duration);
          const e = 1 - Math.pow(1 - p, 3);
          set(from + (target - from) * e);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      () => set(target)
    );
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

// ---- Plunk: NeoPOP's raised surface -------------------------------------
//
// A flat face with two skewed edges (right, bottom) that read as depth.
// Pressable plunks sink into their edges while pressed.

export type PlunkTone = 'accent' | 'white' | 'dark';

const plunkTones: Record<PlunkTone, { face: string; right: string; bottom: string; ink: string }> = {
  accent: { face: colors.accent, right: colors.accentEdge, bottom: colors.accentShadow, ink: colors.bg },
  white: { face: colors.text, right: colors.muted, bottom: colors.divider, ink: colors.bg },
  dark: { face: colors.surface, right: colors.divider, bottom: colors.surface, ink: colors.text },
};

export function plunkInk(tone: PlunkTone) {
  return plunkTones[tone].ink;
}

export function Plunk({
  tone = 'dark',
  depth = 5,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityRole,
  style,
  children,
}: {
  tone?: PlunkTone;
  depth?: number;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const t = plunkTones[tone];
  // The edges are drawn as SVG polygons hanging off the face's right and
  // bottom sides. (CSS-style skew transforms render wrongly on Android.)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!size || size.w !== w || size.h !== h) setSize({ w, h });
  };
  const edges = size && (
    <Svg
      pointerEvents="none"
      width={size.w + depth}
      height={size.h + depth}
      style={plunkStyles.edges}
    >
      <Polygon
        points={`${size.w},0 ${size.w + depth},${depth} ${size.w + depth},${size.h + depth} ${size.w},${size.h}`}
        fill={t.right}
      />
      <Polygon
        points={`0,${size.h} ${size.w},${size.h} ${size.w + depth},${size.h + depth} ${depth},${size.h + depth}`}
        fill={t.bottom}
      />
    </Svg>
  );
  const base: StyleProp<ViewStyle> = [{ backgroundColor: t.face, marginRight: depth, marginBottom: depth }, style];

  if (!onPress) {
    return (
      <View style={base} onLayout={onLayout}>
        {edges}
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onLayout={onLayout}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [base, pressed && { transform: [{ translateX: depth }, { translateY: depth }] }, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <>
          {!pressed && edges}
          {children}
        </>
      )}
    </Pressable>
  );
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
  const label = loading ? (
    <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.accent} />
  ) : (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      style={[
        buttonStyles.text,
        variant === 'primary' && { color: colors.bg },
        variant === 'ghost' && { color: colors.accent },
      ]}
    >
      {title}
    </Text>
  );

  if (variant === 'primary') {
    return (
      <Plunk
        tone="accent"
        onPress={onPress}
        disabled={disabled || loading}
        style={[buttonStyles.base, block && buttonStyles.block]}
      >
        {label}
      </Plunk>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        buttonStyles.base,
        variant === 'secondary' && buttonStyles.secondary,
        block && buttonStyles.block,
        pressed && { opacity: 0.7 },
        (disabled || loading) && styles.disabled,
      ]}
    >
      {label}
    </Pressable>
  );
}

export function IconButton({ onPress, children, label }: { onPress?: () => void; children: React.ReactNode; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [buttonStyles.base, buttonStyles.icon, pressed && { backgroundColor: colors.surface }]}
    >
      {children}
    </Pressable>
  );
}

// ---- Tag -----------------------------------------------------------

// accent: needs attention (over budget, due soon). neutral: everything else.
type TagVariant = 'accent' | 'neutral';

export function Tag({ label, variant = 'neutral' }: { label: string; variant?: TagVariant }) {
  return (
    <View style={[tagStyles.base, variant === 'accent' ? tagStyles.accent : tagStyles.neutral]}>
      <Text style={[tagStyles.text, { color: variant === 'accent' ? colors.bg : colors.muted }]}>{label}</Text>
    </View>
  );
}

// ---- Bar (progress) -----------------------------------------------------------

export function Bar({ pct, color, delay = 200 }: { pct: number; color?: string; delay?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={barStyles.track}>
      <View style={{ width: `${clamped}%`, height: '100%' }}>
        <Grow axis="x" delay={delay} style={[barStyles.fill, { backgroundColor: color ?? colors.text }]} />
      </View>
    </View>
  );
}

// ---- Chip -----------------------------------------------------------

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
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
          accessibilityRole="button"
          accessibilityState={{ selected: opt.value === value }}
          style={[segStyles.opt, i > 0 && segStyles.optBorder, opt.value === value && segStyles.optActive]}
        >
          <Text style={[segStyles.text, opt.value === value && segStyles.textActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---- Toggle -----------------------------------------------------------

// Square NeoPOP switch; the knob springs across. Same props as RN's Switch.
export function Toggle({
  value,
  onValueChange,
  testID,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: value ? 1 : 0, speed: 20, bounciness: 8, useNativeDriver }).start();
  }, [x, value]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, 24] });
  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      style={[toggleStyles.track, value && toggleStyles.trackOn]}
    >
      <Animated.View
        style={[toggleStyles.knob, { backgroundColor: value ? colors.bg : colors.muted, transform: [{ translateX }] }]}
      />
    </Pressable>
  );
}

// ---- Input -----------------------------------------------------------

export function Input(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.accent}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[inputStyles.base, focused && inputStyles.focused, props.style]}
    />
  );
}

// ---- Card -----------------------------------------------------------

export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[cardStyles.base, style]} />;
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
  k: { ...caps, color: colors.muted },
  num: { fontFamily: fonts.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  heading: { fontFamily: fonts.display, color: colors.text, fontSize: 26 },
  body: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted },
  disabled: { opacity: 0.45 },
});

const plunkStyles = StyleSheet.create({
  edges: { position: 'absolute', top: 0, left: 0 },
});

const buttonStyles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  secondary: { borderWidth: 1, borderColor: colors.divider, backgroundColor: 'transparent' },
  icon: { width: 44, minHeight: 44, paddingHorizontal: 0, borderWidth: 1, borderColor: colors.divider },
  block: { alignSelf: 'stretch' },
  text: { ...caps, fontSize: 13, letterSpacing: 1.6, color: colors.text },
});

const tagStyles = StyleSheet.create({
  base: { paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  accent: { backgroundColor: colors.accent },
  neutral: { borderWidth: 1, borderColor: colors.divider },
  text: { ...caps, fontSize: 10, letterSpacing: 1.5 },
});

const barStyles = StyleSheet.create({
  track: { height: 8, backgroundColor: colors.divider, width: '100%' },
  fill: { height: '100%' },
});

const chipStyles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    minHeight: 36,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { borderColor: colors.accent, backgroundColor: colors.accent },
  text: { ...caps, fontSize: 11, letterSpacing: 1.5, color: colors.muted },
  textActive: { color: colors.bg },
});

const segStyles = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 1, borderColor: colors.divider },
  opt: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  optBorder: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  optActive: { backgroundColor: colors.text },
  text: { ...caps, fontSize: 11, letterSpacing: 1.5, color: colors.muted },
  textActive: { color: colors.bg },
});

const toggleStyles = StyleSheet.create({
  track: { width: 52, height: 28, padding: 3, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg },
  trackOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  knob: { width: 20, height: 20 },
});

const inputStyles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 14,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  focused: { borderColor: colors.accent },
});

const cardStyles = StyleSheet.create({
  base: {
    padding: spacing.s4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    gap: spacing.s2,
  },
});

const headerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: { fontSize: 40, lineHeight: 44 },
});
