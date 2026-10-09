import { contrastRatio, DEFAULT_THEME, resolveTheme, themeToStyle } from './theme';

const imageUrl = (path: string) => `https://cdn.test/${path}`;

describe('resolveTheme', () => {
  it('returns the default theme for missing or non-object input', () => {
    for (const raw of [null, undefined, 'x', 42, [], {}]) {
      expect(resolveTheme(raw)).toEqual(DEFAULT_THEME);
    }
  });

  it('keeps valid fields and fills the rest from defaults', () => {
    const theme = resolveTheme({
      layout: 'poster',
      colors: { primary: '#5B2BD6' },
      typography: { pairing: 'elegant' },
    });

    expect(theme.layout).toBe('poster');
    expect(theme.colors.primary).toBe('#5b2bd6');
    expect(theme.colors.accent).toBe(DEFAULT_THEME.colors.accent);
    expect(theme.typography).toEqual({ pairing: 'elegant', scale: DEFAULT_THEME.typography.scale });
  });

  it('drops invalid values field by field', () => {
    const theme = resolveTheme({
      version: 1,
      layout: 'grid',
      colors: { primary: 'red', text: '#12345' },
      background: { kind: 'video', overlay: 5, blur: -3, imagePath: '../secret.png' },
      hero: { imagePath: 'https://evil.test/x.png', alt: 7, fit: 'stretch' },
      typography: { pairing: 'comic-sans', scale: 'xl' },
      card: { style: 'glass', radius: 'huge' },
      button: { style: 'ghost' },
    });

    expect(theme.layout).toBe('card');
    expect(theme.colors.primary).toBe(DEFAULT_THEME.colors.primary);
    expect(theme.colors.text).toBe(DEFAULT_THEME.colors.text);
    expect(theme.background).toEqual({ ...DEFAULT_THEME.background, overlay: 0.8, blur: 0 });
    expect(theme.hero).toEqual({ imagePath: undefined, alt: '', fit: 'cover' });
    expect(theme.typography).toEqual(DEFAULT_THEME.typography);
    expect(theme.card).toEqual({ style: 'glass', radius: 'lg' });
    expect(theme.button.style).toBe('solid');
  });

  it('accepts Storage paths for images', () => {
    const theme = resolveTheme({ hero: { imagePath: 'events/abc/invite-1.webp', alt: 'Invite' } });
    expect(theme.hero.imagePath).toBe('events/abc/invite-1.webp');
    expect(theme.hero.alt).toBe('Invite');
  });

  it('round-trips a complete theme unchanged', () => {
    const wedding = resolveTheme({
      version: 1,
      layout: 'poster',
      colors: {
        primary: '#161412',
        accent: '#8f6f3f',
        text: '#161412',
        surface: '#fbf8f1',
        background: '#f1ebdf',
      },
      background: { kind: 'color', gradientTo: '#e6dfd1', overlay: 0, blur: 0 },
      hero: { alt: '', fit: 'cover' },
      typography: { pairing: 'elegant', scale: 'lg' },
      card: { style: 'outline', radius: 'none' },
      button: { style: 'outline' },
    });
    expect(resolveTheme(JSON.parse(JSON.stringify(wedding)))).toEqual(wedding);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#5b2bd6', '#ffffff')).toBeGreaterThan(4.5);
  });
});

describe('themeToStyle', () => {
  it('maps colors, radius, fonts and scale', () => {
    const style = themeToStyle(
      resolveTheme({
        colors: { primary: '#5b2bd6', background: '#ffd66b' },
        background: { kind: 'gradient', gradientTo: '#ff9fbf' },
        typography: { pairing: 'playful', scale: 'lg' },
        card: { radius: 'xl' },
      }),
      imageUrl,
    );

    expect(style['--rsvp-primary']).toBe('#5b2bd6');
    expect(style['--rsvp-on-primary']).toBe('#ffffff');
    expect(style['--rsvp-background']).toBe('linear-gradient(160deg, #ffd66b 0%, #ff9fbf 100%)');
    expect(style['--rsvp-bg-image']).toBe('none');
    expect(style['--rsvp-radius']).toBe('24px');
    expect(style['--rsvp-font-heading']).toBe('"Baloo 2", Georgia, serif');
    expect(style['--rsvp-heading-weight']).toBe('800');
    expect(style['--rsvp-scale']).toBe('1.06');
  });

  it('picks dark text on light primaries', () => {
    const style = themeToStyle(resolveTheme({ colors: { primary: '#e9c46a' } }), imageUrl);
    expect(style['--rsvp-on-primary']).toBe('#161412');
  });

  it('makes glass surfaces translucent and uses the light error color on dark ones', () => {
    const style = themeToStyle(
      resolveTheme({ colors: { surface: '#0c2218' }, card: { style: 'glass' } }),
      imageUrl,
    );
    expect(style['--rsvp-surface']).toBe('#0c2218a8');
    expect(style['--rsvp-error']).toBe('#ffa69c');
  });

  it('resolves background images through imageUrl, with a pattern until one is uploaded', () => {
    const withImage = themeToStyle(
      resolveTheme({ background: { kind: 'image', imagePath: 'bg/lights.jpg', overlay: 0.55 } }),
      imageUrl,
    );
    expect(withImage['--rsvp-bg-image']).toBe('url("https://cdn.test/bg/lights.jpg")');
    expect(withImage['--rsvp-overlay']).toBe('rgba(0, 0, 0, 0.55)');

    const withoutImage = themeToStyle(resolveTheme({ background: { kind: 'image' } }), imageUrl);
    expect(withoutImage['--rsvp-bg-image']).toContain('repeating-linear-gradient');
  });
});
