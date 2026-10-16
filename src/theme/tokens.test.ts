import { applyTheme, colors, currentTheme, DEFAULT_THEME, isThemeId, palettes, themed, withAlpha } from './tokens';

afterEach(() => applyTheme(DEFAULT_THEME));

describe('themes', () => {
  it('applyTheme swaps the live colours in place', () => {
    applyTheme('paper');
    expect(colors.bg).toBe(palettes.paper.bg);
    expect(colors.accent).toBe(palettes.paper.accent);
    expect(currentTheme()).toBe('paper');
  });

  it('themed styles rebuild after a theme change, once', () => {
    const make = jest.fn(() => ({ screen: { backgroundColor: colors.bg } }));
    const styles = themed(make);
    expect(styles.screen.backgroundColor).toBe(palettes.paccha.bg);
    expect(styles.screen.backgroundColor).toBe(palettes.paccha.bg);
    expect(make).toHaveBeenCalledTimes(1);

    applyTheme('midnight');
    expect(styles.screen.backgroundColor).toBe(palettes.midnight.bg);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('only accepts known theme ids from storage', () => {
    expect(isThemeId('pink')).toBe(true);
    expect(isThemeId('nope')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('withAlpha turns a hex colour into rgba', () => {
    expect(withAlpha('#0D0D0D', 0.15)).toBe('rgba(13,13,13,0.15)');
  });
});
