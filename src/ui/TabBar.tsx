import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StackActions } from '@react-navigation/native';
import { caps, colors } from '../theme/tokens';

// NeoPOP nav bar: no icons, all-caps labels, 64px content height + OS gesture
// inset, active tab marked by a full-width accent rule on the top edge (not a
// React Navigation default — hence a custom tabBar instead of tabBarIcon/-Style).
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
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
            {isFocused && <View style={styles.activeRule} />}
            <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
    top: 0,
    left: 0,
    right: 0,
    height: 3,
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
});
