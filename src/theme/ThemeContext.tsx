import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'react-native';
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

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => (isThemeId(saved) ? saved : DEFAULT_THEME))
      .catch(() => DEFAULT_THEME)
      .then((id) => {
        applyTheme(id);
        setThemeState(id);
      });
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    applyTheme(id);
    setThemeState(id);
    AsyncStorage.setItem(KEY, id).catch((e) => console.warn('Could not save the theme', e));
  }, []);

  const value = useMemo(() => ({ theme: theme ?? DEFAULT_THEME, setTheme }), [theme, setTheme]);

  // Hold the first frame until the saved theme is applied, so the app never
  // flashes the default palette.
  if (theme === null) return null;

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar barStyle={palettes[theme].dark ? 'light-content' : 'dark-content'} />
      {children}
    </ThemeContext.Provider>
  );
}
