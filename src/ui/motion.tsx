// Motion pieces from the NeoPOP Motion lab and motion catalog. Every one
// skips straight to its end state when the OS asks for reduced motion.
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { caps, colors, fonts, themed } from '../theme/tokens';
import { Plunk, type PlunkTone, whenMotionAllowed } from './primitives';

const native = Platform.OS !== 'web';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---- Odometer: each digit rolls up to its value ----------------------------

function DigitColumn({ digit, delay, style, lineHeight }: { digit: number; delay: number; style: StyleProp<TextStyle>; lineHeight: number }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    whenMotionAllowed(
      () => Animated.timing(y, { toValue: digit, duration: 450, delay, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(),
      () => y.setValue(digit)
    );
  }, [y, digit, delay]);
  const translateY = y.interpolate({ inputRange: [0, 9], outputRange: [0, -9 * lineHeight] });
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      {/* The target digit, invisible, sizes the column to its own width. */}
      <Text style={[style, { lineHeight, opacity: 0 }]}>{digit}</Text>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>
        {Array.from({ length: 10 }, (_, n) => (
          <Text key={n} style={[style, { lineHeight, height: lineHeight, textAlign: 'center' }]}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function Odometer({ value, style, lineHeight }: { value: string; style: StyleProp<TextStyle>; lineHeight: number }) {
  let d = 0;
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={value}>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn key={i} digit={Number(ch)} delay={d++ * 25} style={style} lineHeight={lineHeight} />
        ) : (
          <Text key={i} style={[style, { lineHeight }]}>
            {ch}
          </Text>
        )
      )}
    </View>
  );
}

// ---- Ring: progress circle that fills on mount ------------------------------

export function Ring({
  size,
  stroke,
  pct,
  color,
  track,
  children,
}: {
  size: number;
  stroke: number;
  pct: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(1, pct));
  useEffect(() => {
    whenMotionAllowed(
      () => Animated.timing(v, { toValue: target, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(),
      () => v.setValue(target)
    );
  }, [v, target]);
  const offset = v.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? colors.divider} strokeWidth={stroke} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? colors.accent}
          strokeWidth={stroke}
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ---- Shake: wiggles its children whenever `trigger` becomes truthy or changes ----

export function Shake({ trigger, children, style }: { trigger: unknown; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger) return;
    whenMotionAllowed(
      () =>
        Animated.sequence(
          [-9, 9, -7, 7, -4, 0].map((toValue) => Animated.timing(x, { toValue, duration: 55, useNativeDriver: native }))
        ).start(),
      () => {}
    );
  }, [x, trigger]);
  return <Animated.View style={[style, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

// ---- Pulse: gentle blink for things that need attention ---------------------

export function Pulse({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    whenMotionAllowed(
      () => {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(o, { toValue: 0.35, duration: 700, useNativeDriver: native }),
            Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: native }),
          ])
        );
        loop.start();
      },
      () => {}
    );
    return () => loop?.stop();
  }, [o]);
  return <Animated.View style={[style, { opacity: o }]}>{children}</Animated.View>;
}

// ---- Lift: springs up while active (tapped bar, selected item) --------------

export function Lift({ active, children, style }: { active: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const y = useRef(new Animated.Value(active ? -6 : 0)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: active ? -6 : 0, speed: 18, bounciness: 12, useNativeDriver: native }).start();
  }, [y, active]);
  return <Animated.View style={[style, { transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

// ---- Shine: a light band that sweeps across its parent every few seconds ----

export function Shine() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    whenMotionAllowed(
      () => {
        loop = Animated.loop(
          Animated.sequence([
            Animated.delay(1200),
            Animated.timing(x, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
            Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: native }),
            Animated.delay(1600),
          ])
        );
        loop.start();
      },
      () => {}
    );
    return () => loop?.stop();
  }, [x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-160, 520] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[motionStyles.shine, { transform: [{ translateX }, { skewX: '-20deg' }] }]}
    />
  );
}

// ---- Skeleton: shimmering placeholder blocks while data loads ---------------

export function Skeleton({ blocks = [{ h: 14, w: '45%' }, { h: 120 }, { h: 14, w: '80%' }, { h: 48 }, { h: 48 }, { h: 48 }] }: {
  blocks?: { h: number; w?: `${number}%` }[];
}) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    whenMotionAllowed(
      () => {
        loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: native }));
        loop.start();
      },
      () => {}
    );
    return () => loop?.stop();
  }, [x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-200, 420] });
  return (
    <View style={{ gap: 14 }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {blocks.map((b, i) => (
        <View key={i} style={[motionStyles.skeleton, { height: b.h, width: b.w ?? '100%' }]}>
          <Animated.View style={[motionStyles.skeletonSweep, { transform: [{ translateX }] }]} />
        </View>
      ))}
    </View>
  );
}

// ---- Sheet: pop-up sheets spring up while the backdrop fades in -------------

export function useSheetMotion(visible: boolean) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    v.setValue(0);
    whenMotionAllowed(
      () => Animated.spring(v, { toValue: 1, speed: 16, bounciness: 5, useNativeDriver: native }).start(),
      () => v.setValue(1)
    );
  }, [v, visible]);
  return {
    backdropStyle: { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) },
    sheetStyle: { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }] },
  };
}

// ---- SlideInText: each newly typed character slides up into place ---------

function SlideChar({ ch, style }: { ch: string; style: StyleProp<TextStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    whenMotionAllowed(
      () => Animated.timing(v, { toValue: 1, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(),
      () => v.setValue(1)
    );
  }, [v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return <Animated.Text style={[style, { opacity: v, transform: [{ translateY }] }]}>{ch}</Animated.Text>;
}

export function SlideInText({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={text}>
      {text.split('').map((ch, i) => (
        // Keyed by position: characters already on screen stay put, new ones animate in.
        <SlideChar key={i} ch={ch} style={style} />
      ))}
    </View>
  );
}

// ---- Toast: slides down from the top, optional action, hides itself ---------

export function Toast({
  message,
  error,
  actionLabel,
  onAction,
  onHide,
  duration = 3500,
}: {
  message: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  onHide: () => void;
  duration?: number;
}) {
  const y = useRef(new Animated.Value(-120)).current;
  const hideRef = useRef(onHide);
  hideRef.current = onHide;
  useEffect(() => {
    const show = Animated.spring(y, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: native });
    const hide = Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: native });
    show.start();
    const t = setTimeout(() => hide.start(() => hideRef.current()), duration);
    return () => clearTimeout(t);
  }, [y, message, duration]);
  return (
    <Animated.View style={[motionStyles.toast, { transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite">
      <View style={motionStyles.toastTick}>
        <Text style={motionStyles.toastTickText}>{error ? '!' : '✓'}</Text>
      </View>
      <Text style={motionStyles.toastText} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={motionStyles.toastAction}>{actionLabel}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ---- Stamp: lands with a thud (PAID ✓) -------------------------------------

export function Stamp({ label }: { label: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    whenMotionAllowed(
      () => Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start(),
      () => v.setValue(1)
    );
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [2.2, 1] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '-6deg'] });
  return (
    <Animated.View style={[motionStyles.stamp, { opacity: v, transform: [{ scale }, { rotate }] }]}>
      <Text style={motionStyles.stampText}>{label}</Text>
    </Animated.View>
  );
}

// ---- Confetti: squares burst out once per `run` value ------------------------

const BURST = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const d = 70 + (i % 3) * 30;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d - 20, r: (i % 2 ? 1 : -1) * (120 + i * 25) };
});

export function Confetti({ run }: { run: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!run) return;
    v.setValue(0);
    whenMotionAllowed(
      () => Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start(),
      () => {}
    );
  }, [v, run]);
  if (!run) return null;
  return (
    <View pointerEvents="none" style={motionStyles.confetti}>
      {BURST.map((b, i) => {
        const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, b.x] });
        const translateY = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, b.y, b.y + 40] });
        const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.r}deg`] });
        const opacity = v.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] });
        const color = [colors.accent, colors.text, colors.muted][i % 3];
        return (
          <Animated.View
            key={i}
            style={[motionStyles.confettiBit, { backgroundColor: color, opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}
          />
        );
      })}
    </View>
  );
}

// ---- SwipeToConfirm: drag the thumb across to confirm ------------------------

const THUMB = 50;

export function SwipeToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [width, setWidth] = useState(0);
  const max = Math.max(0, width - THUMB - 8);
  const x = useRef(new Animated.Value(0)).current;
  const maxRef = useRef(0);
  maxRef.current = max;
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(0, Math.min(maxRef.current, g.dx))),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > maxRef.current * 0.8) {
          Animated.timing(x, { toValue: maxRef.current, duration: 120, useNativeDriver: false }).start(() => confirmRef.current());
        } else {
          Animated.spring(x, { toValue: 0, speed: 16, bounciness: 10, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const fill = Animated.add(x, THUMB + 4);
  return (
    <View
      style={motionStyles.swipeTrack}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={() => confirmRef.current()}
    >
      <Animated.View style={[motionStyles.swipeFill, { width: fill }]} />
      <Text style={motionStyles.swipeLabel}>{label}</Text>
      <Animated.View style={[motionStyles.swipeThumb, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <Text style={motionStyles.swipeArrow}>»</Text>
      </Animated.View>
    </View>
  );
}

// ---- SlidingChips: filter chips with a highlight that springs between them ----

export function SlidingChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; y: number; w: number }>>({});
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const target = layouts[value];
  useEffect(() => {
    if (!target) return;
    if (!placed.current) {
      left.setValue(target.x);
      width.setValue(target.w);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(left, { toValue: target.x, speed: 16, bounciness: 9, useNativeDriver: false }),
      Animated.spring(width, { toValue: target.w, speed: 16, bounciness: 9, useNativeDriver: false }),
    ]).start();
  }, [target, left, width]);

  return (
    <View style={motionStyles.chipsRow}>
      {target && <Animated.View style={[motionStyles.chipPill, { top: target.y, left, width }]} />}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            onLayout={(e) => {
              const { x, y, width: w } = e.nativeEvent.layout;
              setLayouts((l) => (l[o.value]?.x === x && l[o.value]?.y === y && l[o.value]?.w === w ? l : { ...l, [o.value]: { x, y, w } }));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[motionStyles.chip, on && motionStyles.chipOn]}
          >
            <Text style={[motionStyles.chipText, on && motionStyles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- TiltCard: leans toward your finger while pressed, springs back ---------

export function TiltCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const size = useRef({ w: 1, h: 1 });
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  const lean = (x: number, y: number) => {
    const px = x / size.current.w - 0.5;
    const py = y / size.current.h - 0.5;
    Animated.parallel([
      Animated.spring(rx, { toValue: -py * 12, speed: 20, bounciness: 4, useNativeDriver: native }),
      Animated.spring(ry, { toValue: px * 14, speed: 20, bounciness: 4, useNativeDriver: native }),
    ]).start();
  };
  const settle = () =>
    Animated.parallel([
      Animated.spring(rx, { toValue: 0, speed: 14, bounciness: 10, useNativeDriver: native }),
      Animated.spring(ry, { toValue: 0, speed: 14, bounciness: 10, useNativeDriver: native }),
    ]).start();
  const rotateX = rx.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  const rotateY = ry.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  return (
    <Animated.View
      style={[style, { transform: [{ perspective: 800 }, { rotateX }, { rotateY }] }]}
      onLayout={(e) => (size.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 })}
      onTouchStart={(e) => lean(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onTouchMove={(e) => lean(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onTouchEnd={settle}
      onTouchCancel={settle}
    >
      {children}
    </Animated.View>
  );
}

// ---- QuickAdd: the + button opens quick actions that pop up in a stack -----

export type QuickAction = { label: string; tone: PlunkTone; onPress: () => void };

export function QuickAdd({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: open ? 1 : 0, speed: 18, bounciness: 7, useNativeDriver: native }).start();
  }, [v, open]);
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close quick actions" accessibilityRole="button">
          <Animated.View style={[StyleSheet.absoluteFill, motionStyles.quickDim, { opacity: v }]} />
        </Pressable>
      )}
      {open && (
        <View style={motionStyles.quickList} pointerEvents="box-none">
          {actions.map((a, i) => {
            // Lower buttons arrive first, so the stack rises out of the + button.
            const k = actions.length - 1 - i;
            const t = v.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
            return (
              <Animated.View
                key={a.label}
                style={{
                  opacity: t,
                  transform: [
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [30 + k * 18, 0] }) },
                    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                  ],
                }}
              >
                <Plunk
                  tone={a.tone}
                  depth={4}
                  onPress={() => {
                    setOpen(false);
                    a.onPress();
                  }}
                  style={motionStyles.quickItem}
                >
                  <Text style={[motionStyles.quickText, a.tone === 'dark' && { color: colors.text }]}>{a.label}</Text>
                </Plunk>
              </Animated.View>
            );
          })}
        </View>
      )}
      <Plunk
        tone="accent"
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel={open ? 'Close quick actions' : 'Add a transaction'}
        style={motionStyles.quickFab}
      >
        <Animated.Text style={[motionStyles.quickPlus, { transform: [{ rotate }] }]}>+</Animated.Text>
        <Text style={motionStyles.quickFabText}>{open ? 'Close' : 'Add'}</Text>
      </Plunk>
    </View>
  );
}

// ---- Pull to refresh: the f tile drops in and spins while you refresh -------
//
// Tracks the pull itself, not every background refetch, so the tile only
// shows when you asked for it. Stays at least 700ms so the motion reads.

export function usePullRefresh(loading: boolean, refetch: () => void) {
  const [pulling, setPulling] = useState(false);
  const sawLoading = useRef(false);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!pulling) return;
    if (loading) {
      sawLoading.current = true;
      return;
    }
    if (!sawLoading.current) return;
    const t = setTimeout(() => setPulling(false), Math.max(0, 700 - (Date.now() - startedAt.current)));
    return () => clearTimeout(t);
  }, [pulling, loading]);
  useEffect(() => {
    if (!pulling) return;
    const t = setTimeout(() => setPulling(false), 8000); // never spin forever
    return () => clearTimeout(t);
  }, [pulling]);
  const onRefresh = () => {
    sawLoading.current = false;
    startedAt.current = Date.now();
    setPulling(true);
    refetch();
  };
  return { refreshing: pulling, onRefresh };
}

export function RefreshTile({ refreshing }: { refreshing: boolean }) {
  const drop = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (refreshing) {
      setShown(true);
      spin.setValue(0);
      const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: native }));
      Animated.spring(drop, { toValue: 1, speed: 16, bounciness: 10, useNativeDriver: native }).start();
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(drop, { toValue: 0, duration: 180, useNativeDriver: native }).start(() => setShown(false));
  }, [refreshing, drop, spin]);
  if (!shown) return null;
  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View pointerEvents="none" style={[motionStyles.refreshTile, { transform: [{ translateY }, { rotate }] }]}>
      <Text style={motionStyles.refreshF}>f</Text>
    </Animated.View>
  );
}

// ---- SwipeRow: swipe left to reveal actions behind a row --------------------

const ACTION_W = 84;

export type SwipeAction = { label: string; tone: 'accent' | 'plain'; onPress: () => void };

export function SwipeRow({ actions, enabled = true, children }: { actions: SwipeAction[]; enabled?: boolean; children: React.ReactNode }) {
  const open = actions.length * ACTION_W;
  const x = useRef(new Animated.Value(0)).current;
  const at = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const settle = (to: number) => {
    at.current = to;
    Animated.spring(x, { toValue: to, speed: 18, bounciness: 6, useNativeDriver: native }).start();
  };
  const pan = useRef(
    PanResponder.create({
      // Only a clearly sideways drag takes the touch, so vertical scrolling still wins.
      onMoveShouldSetPanResponder: (_e, g) => enabledRef.current && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(-open - 20, Math.min(0, at.current + g.dx))),
      onPanResponderRelease: (_e, g) => settle(at.current + g.dx < -open / 2 ? -open : 0),
      onPanResponderTerminate: () => settle(at.current),
    })
  ).current;
  useEffect(() => {
    if (!enabled && at.current !== 0) settle(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return (
    <View style={motionStyles.swipeRow}>
      <View style={motionStyles.swipeActions}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              settle(0);
              a.onPress();
            }}
            accessibilityRole="button"
            style={[motionStyles.swipeAction, a.tone === 'accent' ? motionStyles.swipeActionAccent : motionStyles.swipeActionPlain]}
          >
            <Text style={motionStyles.swipeActionText}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={[motionStyles.swipeFront, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// ---- FlyCard: a handled card flies off, then the list closes the gap --------

export function FlyCard({ children, style }: { children: (fly: (then: () => unknown) => void) => React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  const fly = (then: () => unknown) =>
    whenMotionAllowed(
      () =>
        Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: native }).start(() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          // If the card is still here afterwards (the action failed), bring it back.
          Promise.resolve(then()).finally(() => v.setValue(0));
        }),
      () => {
        then();
      }
    );
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, 420] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '10deg'] });
  const opacity = v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.6, 0] });
  return <Animated.View style={[style, { opacity, transform: [{ translateX }, { rotate }] }]}>{children(fly)}</Animated.View>;
}

// ---- SaveMorph: the Save button shrinks into a tick square -----------------

export function SaveMorph({ label }: { label: string }) {
  const [w, setW] = useState(0);
  const width = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!w) return;
    width.setValue(w);
    Animated.timing(width, { toValue: 56, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    Animated.spring(pop, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: native }).start();
  }, [w, width, pop]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={motionStyles.morphRow} accessibilityLabel={label} accessible>
      {w > 0 && (
        <Animated.View style={[motionStyles.morph, { width }]}>
          <Animated.Text style={[motionStyles.morphTick, { transform: [{ scale: pop }] }]}>{'\u2713'}</Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

// ---- LaunchIntro: the f tile drops in once per cold start (≤650ms) ----------
//
// Drawn over the first screen with pointerEvents none, so it never blocks a tap.

let launchIntroPlayed = false;

export function LaunchIntro() {
  const [show, setShow] = useState(!launchIntroPlayed);
  const drop = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!show) return;
    launchIntroPlayed = true;
    whenMotionAllowed(
      () =>
        Animated.sequence([
          Animated.spring(drop, { toValue: 1, speed: 22, bounciness: 10, useNativeDriver: native }),
          Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: native }),
        ]).start(() => setShow(false)),
      () => setShow(false)
    );
  }, [show, drop, fade]);
  if (!show) return null;
  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-420, 0] });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, motionStyles.intro, { opacity: fade }]}>
      <Animated.View style={[motionStyles.introTile, { transform: [{ translateY }] }]}>
        <Text style={motionStyles.introF}>f</Text>
      </Animated.View>
    </Animated.View>
  );
}

const motionStyles = themed(() =>
  StyleSheet.create({
    shine: { position: 'absolute', top: -20, bottom: -20, width: 60, backgroundColor: 'rgba(255,255,255,0.28)' },
    skeleton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, overflow: 'hidden' },
    skeletonSweep: { position: 'absolute', top: 0, bottom: 0, width: 90, backgroundColor: colors.divider, opacity: 0.55 },
    toast: {
      position: 'absolute',
      top: 12,
      left: 14,
      right: 14,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      backgroundColor: colors.text,
    },
    toastTick: { width: 26, height: 26, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    toastTickText: { fontFamily: fonts.heading, color: colors.bg, fontSize: 14 },
    toastText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.bg },
    toastAction: { ...caps, fontSize: 12, color: colors.bg, textDecorationLine: 'underline' },
    stamp: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: colors.accent },
    stampText: { ...caps, fontSize: 11, color: colors.accent },
    confetti: { position: 'absolute', left: '50%', top: '40%', width: 0, height: 0, zIndex: 30 },
    confettiBit: { position: 'absolute', width: 10, height: 10, marginLeft: -5, marginTop: -5 },
    swipeTrack: { height: 56, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg, justifyContent: 'center', overflow: 'hidden' },
    swipeFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent, opacity: 0.25 },
    swipeLabel: { ...caps, textAlign: 'center', paddingLeft: THUMB, color: colors.muted },
    swipeThumb: {
      position: 'absolute',
      left: 3,
      top: 3,
      width: THUMB,
      bottom: 3,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swipeArrow: { fontFamily: fonts.heading, fontSize: 24, color: colors.bg, marginTop: -3 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chipPill: { position: 'absolute', height: 36, backgroundColor: colors.accent },
    chip: { minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
    chipOn: { borderColor: 'transparent' },
    chipText: { ...caps, letterSpacing: 1.5, color: colors.muted },
    chipTextOn: { color: colors.bg },
    refreshTile: { position: 'absolute', top: 10, alignSelf: 'center', width: 40, height: 40, zIndex: 25, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    refreshF: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.bg, marginTop: -4 },
    swipeRow: { overflow: 'hidden' },
    swipeActions: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'flex-end' },
    swipeAction: { width: ACTION_W, alignItems: 'center', justifyContent: 'center' },
    swipeActionAccent: { backgroundColor: colors.accent },
    swipeActionPlain: { backgroundColor: colors.text },
    swipeActionText: { ...caps, fontSize: 10, letterSpacing: 1.4, color: colors.bg },
    swipeFront: { backgroundColor: colors.bg },
    morphRow: { height: 48, alignItems: 'center' },
    morph: { height: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    morphTick: { fontFamily: fonts.heading, fontSize: 22, color: colors.bg },
    quickDim: { backgroundColor: 'rgba(0,0,0,0.6)' },
    quickList: { position: 'absolute', right: 20, bottom: 96, alignItems: 'flex-end', gap: 14 },
    quickItem: { height: 46, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
    quickText: { ...caps, fontSize: 12, letterSpacing: 1.6, color: colors.bg },
    quickFab: { position: 'absolute', right: 20, bottom: 24, height: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
    quickPlus: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 24, color: colors.bg },
    quickFabText: { ...caps, fontSize: 14, color: colors.bg },
    intro: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
    introTile: { width: 112, height: 112, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    introF: { fontFamily: fonts.display, fontSize: 104, lineHeight: 112, color: colors.bg, marginTop: -10 },
  })
);
