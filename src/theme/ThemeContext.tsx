import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, StatusBar, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme, DEFAULT_THEME, isThemeId, palettes, type ThemeId } from './tokens';

// The chosen palette is a per-device look, so it lives in AsyncStorage, not Supabase.
const KEY = 'financeflow.theme';

const ThemeContext = createContext<{ theme: ThemeId; setTheme: (id: ThemeId) => void }>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId | null>(null);
  // Theme wipe: the new ground colour spreads from the top-right corner, the
  // app redraws underneath it, then it fades away.
  const [wipe, setWipe] = useState<string | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => (isThemeId(saved) ? saved : DEFAULT_THEME))
      .catch(() => DEFAULT_THEME)
      .then((id) => {
        applyTheme(id);
        setThemeState(id);
      });
  }, []);

  const commit = useCallback((id: ThemeId) => {
    applyTheme(id);
    setThemeState(id);
    AsyncStorage.setItem(KEY, id).catch((e) => console.warn('Could not save the theme', e));
  }, []);

  const setTheme = useCallback(
    (id: ThemeId) => {
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduce) => {
          if (reduce) return commit(id);
          grow.setValue(0);
          fade.setValue(1);
          setWipe(palettes[id].bg);
          Animated.timing(grow, { toValue: 1, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
            commit(id);
            Animated.timing(fade, { toValue: 0, duration: 220, delay: 60, useNativeDriver: true }).start(() => setWipe(null));
          });
        });
    },
    [commit, grow, fade]
  );

  const value = useMemo(() => ({ theme: theme ?? DEFAULT_THEME, setTheme }), [theme, setTheme]);

  // Hold the first frame until the saved theme is applied, so the app never
  // flashes the default palette.
  if (theme === null) return null;

  const { width, height } = Dimensions.get('window');
  const r = Math.hypot(width, height);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar barStyle={palettes[theme].dark ? 'light-content' : 'dark-content'} />
      <View style={styles.fill}>
        {children}
        {wipe && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.wipe,
              { width: r * 2, height: r * 2, borderRadius: r, left: width - r, top: -r, backgroundColor: wipe },
              { opacity: fade, transform: [{ scale: grow }] },
            ]}
          />
        )}
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wipe: { position: 'absolute' },
});
