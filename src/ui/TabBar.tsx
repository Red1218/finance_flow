import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { caps, colors, themed } from '../theme/tokens';

// NeoPOP nav bar: no icons, all-caps labels, 64px content height + OS gesture
// inset, active tab marked by an accent rule on the top edge that springs
// between tabs (not a React Navigation default — hence a custom tabBar).
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const slot = width / state.routes.length;
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (!slot) return;
    if (!placed.current) {
      x.setValue(state.index * slot);
      placed.current = true;
      return;
    }
    Animated.spring(x, { toValue: state.index * slot, speed: 18, bounciness: 8, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [x, slot, state.index]);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {slot > 0 && <Animated.View style={[styles.activeRule, { width: slot, transform: [{ translateX: x }] }]} />}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const isFocused = state.index === index;

        // A tab always opens on its first screen. Home's bill links open Bills
        // inside More and leave that link's params on the More tab route —
        // passing them on (as the stock tab bar does) reopened Bills on every
        // tap, hiding the More list.
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          const nested = route.state;
          if (nested?.key && (nested.index ?? 0) > 0) {
            navigation.dispatch({ ...StackActions.popToTop(), target: nested.key });
          }
          if (!isFocused) navigation.navigate(route.name);
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            onFocus={() => setFocusedKey(route.key)}
            onBlur={() => setFocusedKey((k) => (k === route.key ? null : k))}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={label}
            style={[styles.item, focusedKey === route.key && styles.itemFocused]}
          >
            <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      backgroundColor: colors.bg,
    },
    item: {
      flex: 1,
      minHeight: 64,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemFocused: {
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: colors.accent,
      outlineOffset: -2,
    },
    activeRule: {
      position: 'absolute',
      top: -1,
      left: 0,
      height: 3,
      zIndex: 1,
      backgroundColor: colors.accent,
    },
    label: {
      ...caps,
      letterSpacing: 1.5,
      color: colors.muted,
    },
    labelActive: {
      color: colors.text,
    },
  })
);
