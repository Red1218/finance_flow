// Ported from the Broadsheet design system (styles.css custom properties).
// Single styling system for this app: RN StyleSheet + these tokens. No NativeWind/Tailwind.

export const colors = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  text: '#201e1d',
  divider: 'rgba(32,30,29,0.16)',
  dividerFaint: 'rgba(32,30,29,0.08)',

  accent: '#0088b0',
  accent100: '#e9f8ff',
  accent200: '#cbeeff',
  accent300: '#99e0ff',
  accent400: '#62c5ee',
  accent500: '#38a6cf',
  accent600: '#1186ac',
  accent700: '#006786',
  accent800: '#004961',
  accent900: '#0a303e',

  accent2: '#d6006c',
  accent2_100: '#fff1f4',
  accent2_200: '#ffdee6',
  accent2_300: '#ffc0d0',
  accent2_400: '#ff90b1',
  accent2_500: '#ff458e',
  accent2_600: '#d82071',
  accent2_700: '#aa0b56',
  accent2_800: '#790e3d',
  accent2_900: '#4b1528',

  neutral100: '#f8f4f4',
  neutral200: '#eae7e7',
  neutral300: '#d7d3d3',
  neutral400: '#bab6b6',
  neutral500: '#9b9797',
  neutral600: '#7d7979',
  neutral700: '#605d5d',
  neutral800: '#444141',
  neutral900: '#2d2b2b',
} as const;

export const spacing = {
  s1: 5,
  s2: 10,
  s3: 15,
  s4: 20,
  s6: 30,
  s8: 40,
} as const;

export const radius = {
  sm: 1,
  md: 2,
  lg: 4,
  pill: 999,
} as const;

export const fonts = {
  heading: 'SourceSerif4_600SemiBold',
  headingItalic: 'SourceSerif4_400Regular_Italic',
  body: 'SourceSerif4_400Regular',
} as const;

export const shadow = {
  sm: {
    shadowColor: '#2d2b2b',
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#2d2b2b',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  lg: {
    shadowColor: '#2d2b2b',
    shadowOpacity: 0.22,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;
