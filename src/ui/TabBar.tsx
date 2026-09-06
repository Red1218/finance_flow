import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, fonts } from '../theme/tokens';

// Broadsheet Nav Bar spec: no icons, 52px content height + OS gesture inset,
// active tab marked by a 26x2px accent rule on the top edge (not a React
// Navigation default — hence a custom tabBar instead of tabBarIcon/-Style).
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
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
    minHeight: 52,
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
    alignSelf: 'center',
    width: 26,
    height: 2,
    backgroundColor: colors.accent,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.neutral700,
    letterSpacing: 0.07,
  },
  labelActive: {
    fontFamily: fonts.heading,
    color: colors.accent700,
  },
});
