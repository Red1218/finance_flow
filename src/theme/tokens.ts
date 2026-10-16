// NeoPOP look (CRED's neopop-web): six colours, square corners, raised
// "plunk" edges. Single styling system for this app: RN StyleSheet + these
// tokens. No NativeWind/Tailwind.

type Palette = {
  name: string;
  dark: boolean;
  bg: string;
  surface: string;
  divider: string;
  muted: string;
  text: string;
  // The one highlight: money in, today, due soon, over budget, primary actions.
  // Text on it uses `bg`, and it's used as text on `bg`, so both must read.
  accent: string;
  // Darker shades of the accent, only for the right/bottom plunk edges.
  accentEdge: string;
  accentShadow: string;
};

export const palettes = {
  paccha: { name: 'Neo Paccha', dark: true, bg: '#0D0D0D', surface: '#161616', divider: '#3D3D3D', muted: '#8A8A8A', text: '#FFFFFF', accent: '#E5FE40', accentEdge: '#A0B22D', accentShadow: '#454C13' },
  poli: { name: 'Poli Purple', dark: true, bg: '#0D0D0D', surface: '#161616', divider: '#3D3D3D', muted: '#8A8A8A', text: '#FFFFFF', accent: '#9772FF', accentEdge: '#4A25B3', accentShadow: '#20104D' },
  mannna: { name: 'Mannna Gold', dark: true, bg: '#0D0D0D', surface: '#161616', divider: '#3D3D3D', muted: '#8A8A8A', text: '#FFFFFF', accent: '#FFCB45', accentEdge: '#B38E30', accentShadow: '#4D3D15' },
  pink: { name: 'Pink Pong', dark: true, bg: '#0D0D0D', surface: '#161616', divider: '#3D3D3D', muted: '#8A8A8A', text: '#FFFFFF', accent: '#FF426F', accentEdge: '#B32E4E', accentShadow: '#4D1421' },
  park: { name: 'Park Green', dark: true, bg: '#0D0D0D', surface: '#161616', divider: '#3D3D3D', muted: '#8A8A8A', text: '#FFFFFF', accent: '#3BFFAD', accentEdge: '#29B379', accentShadow: '#124D34' },
  midnight: { name: 'Midnight × Paccha', dark: true, bg: '#20104D', surface: '#2A1666', divider: '#4A25B3', muted: '#B49AFF', text: '#FFFFFF', accent: '#E5FE40', accentEdge: '#A0B22D', accentShadow: '#454C13' },
  paper: { name: 'Paper × Sunshine', dark: false, bg: '#FBFBFB', surface: '#EFEFEF', divider: '#D2D2D2', muted: '#6B6B6B', text: '#0D0D0D', accent: '#B35F30', accentEdge: '#804322', accentShadow: '#4D2914' },
} satisfies Record<string, Palette>;

export type ThemeId = keyof typeof palettes;
export const DEFAULT_THEME: ThemeId = 'paccha';

export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && id in palettes;
}

// The active palette's colours. Mutated in place by applyTheme, so code reads
// colors.x at render time (never copy a value into a module-level constant).
const { name: _name, dark: _dark, ...initial } = palettes[DEFAULT_THEME];
export const colors: Omit<Palette, 'name' | 'dark'> = { ...initial };

let activeTheme: ThemeId = DEFAULT_THEME;
let version = 0;

export function applyTheme(id: ThemeId) {
  const { name: _n, dark: _d, ...p } = palettes[id];
  Object.assign(colors, p);
  activeTheme = id;
  version++;
}

export function currentTheme(): ThemeId {
  return activeTheme;
}

// Wraps a stylesheet factory so `styles.x` always reflects the active theme:
// the factory re-runs (once) after each theme change. Module-level
// `const styles = themed(() => StyleSheet.create({...}))` keeps call sites as they were.
export function themed<T extends object>(make: () => T): T {
  let builtFor = -1;
  let built: T;
  const current = () => {
    if (builtFor !== version) {
      built = make();
      builtFor = version;
    }
    return built;
  };
  return new Proxy({} as T, {
    get: (_t, key) => current()[key as keyof T],
    has: (_t, key) => key in current(),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, key) => Reflect.getOwnPropertyDescriptor(current(), key),
  });
}

// "#RRGGBB" + opacity -> "rgba(...)", for tints that must follow the theme.
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const spacing = {
  s2: 10,
  s3: 15,
  s4: 20,
} as const;

export const fonts = {
  display: 'DMSerifDisplay_400Regular',
  heading: 'Urbanist_800ExtraBold',
  bold: 'Urbanist_700Bold',
  body: 'Urbanist_500Medium',
} as const;

// Small all-caps label: NeoPOP's letter-spaced captions.
export const caps = {
  fontFamily: 'Urbanist_800ExtraBold',
  fontSize: 11,
  letterSpacing: 2,
  textTransform: 'uppercase',
} as const;
