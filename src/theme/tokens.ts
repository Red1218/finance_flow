// NeoPOP look (CRED's neopop-web): six colours, square corners, raised
// "plunk" edges. Single styling system for this app: RN StyleSheet + these
// tokens. No NativeWind/Tailwind.

export const colors = {
  bg: '#0D0D0D',
  surface: '#161616',
  divider: '#3D3D3D',
  muted: '#8A8A8A',
  text: '#FFFFFF',
  // The one highlight: money in, today, due soon, over budget, primary actions.
  accent: '#E5FE40',
  // Darker shades of the accent, only for the right/bottom plunk edges.
  accentEdge: '#A0B22D',
  accentShadow: '#454C13',
} as const;

export const spacing = {
  s1: 5,
  s2: 10,
  s3: 15,
  s4: 20,
  s6: 30,
  s8: 40,
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
