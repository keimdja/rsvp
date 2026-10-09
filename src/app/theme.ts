// Event theme: the versioned JSON stored in events.theme, and its mapping to the
// --rsvp-* CSS custom properties from docs/design/rsvp-theme.css.

export const LAYOUTS = ['card', 'poster'] as const;
export const BACKGROUND_KINDS = ['color', 'gradient', 'image'] as const;
export const HERO_FITS = ['cover', 'contain'] as const;
export const SCALES = ['sm', 'md', 'lg'] as const;
export const CARD_STYLES = ['solid', 'glass', 'outline', 'none'] as const;
export const RADII = ['none', 'sm', 'lg', 'xl'] as const;
export const BUTTON_STYLES = ['solid', 'outline', 'pill'] as const;

export const FONT_PAIRINGS = {
  playful: {
    heading: 'Baloo 2',
    body: 'Nunito',
    weight: 800,
    query: 'family=Baloo+2:wght@500;700;800&family=Nunito:wght@400;600;700;800',
  },
  festive: {
    heading: 'DM Serif Display',
    body: 'DM Sans',
    weight: 400,
    query: 'family=DM+Serif+Display&family=DM+Sans:wght@400;500;700',
  },
  elegant: {
    heading: 'Cormorant Garamond',
    body: 'Jost',
    weight: 500,
    query: 'family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@400;500;600',
  },
  classic: {
    heading: 'Libre Baskerville',
    body: 'Source Sans 3',
    weight: 700,
    query: 'family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;600;700',
  },
  modern: {
    heading: 'Space Grotesk',
    body: 'Work Sans',
    weight: 700,
    query: 'family=Space+Grotesk:wght@500;700&family=Work+Sans:wght@400;500;600',
  },
  warm: {
    heading: 'Bricolage Grotesque',
    body: 'Figtree',
    weight: 800,
    query: 'family=Bricolage+Grotesque:wght@600;800&family=Figtree:wght@400;600;700',
  },
} as const;

export type FontPairingKey = keyof typeof FONT_PAIRINGS;
const FONT_PAIRING_KEYS = Object.keys(FONT_PAIRINGS) as FontPairingKey[];

// A type alias (not an interface) so it is assignable to the JSON column type.
export type EventThemeV1 = {
  version: 1;
  layout: (typeof LAYOUTS)[number];
  colors: {
    primary: string; // buttons, selected choice
    accent: string; // highlights, dividers, focus ring
    text: string; // body and headings on the card
    surface: string; // card fill
    background: string; // page background, and the gradient's first stop
  };
  background: {
    kind: (typeof BACKGROUND_KINDS)[number];
    gradientTo: string;
    imagePath?: string; // path in the event-images bucket
    overlay: number; // 0..0.8 darkening over the image
    blur: number; // 0..12 px
  };
  hero: { imagePath?: string; alt: string; fit: (typeof HERO_FITS)[number] };
  typography: { pairing: FontPairingKey; scale: (typeof SCALES)[number] };
  card: { style: (typeof CARD_STYLES)[number]; radius: (typeof RADII)[number] };
  button: { style: (typeof BUTTON_STYLES)[number] };
};

export type EventTheme = EventThemeV1;

/** The design's "Plain" preset: what an event looks like before it is styled. */
export const DEFAULT_THEME: EventTheme = {
  version: 1,
  layout: 'card',
  colors: {
    primary: '#1c1c1a',
    accent: '#2f6feb',
    text: '#1c1c1a',
    surface: '#ffffff',
    background: '#f1f0ec',
  },
  background: { kind: 'color', gradientTo: '#dcdad3', overlay: 0.4, blur: 0 },
  hero: { alt: '', fit: 'cover' },
  typography: { pairing: 'modern', scale: 'md' },
  card: { style: 'solid', radius: 'lg' },
  button: { style: 'solid' },
};

/** Editor presets from the design (names: admin.look.presetNames.*). Applying one keeps the event's uploaded images. */
export const THEME_PRESETS: Record<string, EventTheme> = {
  birthday: {
    ...DEFAULT_THEME,
    colors: {
      primary: '#5b2bd6',
      accent: '#e5530c',
      text: '#2b1a40',
      surface: '#ffffff',
      background: '#ffd66b',
    },
    background: { kind: 'gradient', gradientTo: '#ff9fbf', overlay: 0.55, blur: 3 },
    typography: { pairing: 'playful', scale: 'lg' },
    card: { style: 'solid', radius: 'xl' },
    button: { style: 'pill' },
  },
  christmas: {
    ...DEFAULT_THEME,
    colors: {
      primary: '#c42b32',
      accent: '#e9c46a',
      text: '#f8f4ea',
      surface: '#0c2218',
      background: '#0e261b',
    },
    background: { kind: 'image', gradientTo: '#2d5a40', overlay: 0.55, blur: 3 },
    typography: { pairing: 'festive', scale: 'md' },
    card: { style: 'glass', radius: 'lg' },
    button: { style: 'solid' },
  },
  wedding: {
    ...DEFAULT_THEME,
    layout: 'poster',
    colors: {
      primary: '#161412',
      accent: '#8f6f3f',
      text: '#161412',
      surface: '#fbf8f1',
      background: '#f1ebdf',
    },
    background: { kind: 'color', gradientTo: '#e6dfd1', overlay: 0.4, blur: 0 },
    typography: { pairing: 'elegant', scale: 'lg' },
    card: { style: 'outline', radius: 'none' },
    button: { style: 'outline' },
  },
  plain: DEFAULT_THEME,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const STORAGE_PATH = /^[\w-]+(?:\.[\w-]+)*(?:\/[\w-]+(?:\.[\w-]+)*)*$/;

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : {};

const color = (value: unknown, fallback: string): string =>
  typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

const storagePath = (value: unknown): string | undefined =>
  typeof value === 'string' && STORAGE_PATH.test(value) ? value : undefined;

/**
 * Turns whatever is stored in events.theme into a complete, valid theme.
 * Each field falls back to DEFAULT_THEME on its own, so a partial or damaged theme
 * never breaks a page. A future version 2 would be migrated here before validation.
 */
export function resolveTheme(raw: unknown): EventTheme {
  const theme = asObject(raw);
  const colors = asObject(theme['colors']);
  const background = asObject(theme['background']);
  const hero = asObject(theme['hero']);
  const typography = asObject(theme['typography']);
  const card = asObject(theme['card']);
  const button = asObject(theme['button']);
  const d = DEFAULT_THEME;

  return {
    version: 1,
    layout: oneOf(theme['layout'], LAYOUTS, d.layout),
    colors: {
      primary: color(colors['primary'], d.colors.primary),
      accent: color(colors['accent'], d.colors.accent),
      text: color(colors['text'], d.colors.text),
      surface: color(colors['surface'], d.colors.surface),
      background: color(colors['background'], d.colors.background),
    },
    background: {
      kind: oneOf(background['kind'], BACKGROUND_KINDS, d.background.kind),
      gradientTo: color(background['gradientTo'], d.background.gradientTo),
      imagePath: storagePath(background['imagePath']),
      overlay: clamp(background['overlay'], 0, 0.8, d.background.overlay),
      blur: clamp(background['blur'], 0, 12, d.background.blur),
    },
    hero: {
      imagePath: storagePath(hero['imagePath']),
      alt: typeof hero['alt'] === 'string' ? hero['alt'].slice(0, 300) : d.hero.alt,
      fit: oneOf(hero['fit'], HERO_FITS, d.hero.fit),
    },
    typography: {
      pairing: oneOf(typography['pairing'], FONT_PAIRING_KEYS, d.typography.pairing),
      scale: oneOf(typography['scale'], SCALES, d.typography.scale),
    },
    card: {
      style: oneOf(card['style'], CARD_STYLES, d.card.style),
      radius: oneOf(card['radius'], RADII, d.card.radius),
    },
    button: { style: oneOf(button['style'], BUTTON_STYLES, d.button.style) },
  };
}

// ---------------------------------------------------------------------------
// Contrast (WCAG 2.x)
// ---------------------------------------------------------------------------

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((shift) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two #rrggbb colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background` (labels on primary). */
export const onColor = (background: string): string =>
  contrastRatio('#ffffff', background) >= contrastRatio('#161412', background)
    ? '#ffffff'
    : '#161412';

// ---------------------------------------------------------------------------
// CSS custom properties
// ---------------------------------------------------------------------------

const RADIUS_PX = { none: '0px', sm: '6px', lg: '16px', xl: '24px' } as const;
const SCALE_FACTOR = { sm: '0.94', md: '1', lg: '1.06' } as const;

/**
 * Maps a theme to the --rsvp-* properties consumed by styles.css and the templates.
 * Supporting tokens (muted, field, border, error, on-primary, tints) are derived the
 * same way as in the design prototype. `imageUrl` turns a Storage path into a URL.
 */
export function themeToStyle(
  theme: EventTheme,
  imageUrl: (path: string) => string,
): Record<string, string> {
  const { colors, background: bg, typography, card, button } = theme;
  const fonts = FONT_PAIRINGS[typography.pairing];
  const pill = button.style === 'pill';
  const fieldRadius = pill ? '18px' : 'calc(var(--rsvp-radius) * 0.55)';
  const glass = card.style === 'glass';
  const darkSurface = luminance(colors.surface) < 0.2;

  let bgImage = 'none';
  if (bg.kind === 'image') {
    // No upload yet: a subtle pattern stands in, as in the design.
    bgImage = bg.imagePath
      ? `url("${imageUrl(bg.imagePath)}")`
      : `repeating-linear-gradient(135deg, color-mix(in oklab, ${colors.accent} 14%, transparent) 0 14px, transparent 14px 28px), ` +
        `radial-gradient(120% 80% at 30% 20%, ${bg.gradientTo} 0%, ${colors.background} 70%)`;
  }

  return {
    '--rsvp-primary': colors.primary,
    '--rsvp-on-primary': onColor(colors.primary),
    '--rsvp-accent': colors.accent,
    '--rsvp-text': colors.text,
    '--rsvp-muted': `color-mix(in oklab, ${colors.text} 76%, ${colors.surface})`,
    '--rsvp-surface': glass ? colors.surface + (darkSurface ? 'a8' : 'c4') : colors.surface,
    '--rsvp-field': glass
      ? `color-mix(in oklab, ${colors.text} 8%, transparent)`
      : `color-mix(in oklab, ${colors.primary} 4%, ${colors.surface})`,
    '--rsvp-border': `color-mix(in oklab, ${colors.text} 52%, ${colors.surface})`,
    '--rsvp-error': darkSurface ? '#ffa69c' : '#b3261e',
    '--rsvp-background':
      bg.kind === 'gradient'
        ? `linear-gradient(160deg, ${colors.background} 0%, ${bg.gradientTo} 100%)`
        : colors.background,
    '--rsvp-bg-image': bgImage,
    '--rsvp-overlay': `rgba(0, 0, 0, ${bg.overlay})`,
    '--rsvp-blur': `${bg.blur}px`,
    '--rsvp-radius': RADIUS_PX[card.radius],
    '--rsvp-field-radius': fieldRadius, // inputs
    '--rsvp-control-radius': pill ? '999px' : fieldRadius, // choices and buttons
    '--rsvp-font-heading': `"${fonts.heading}", Georgia, serif`,
    '--rsvp-font-body': `"${fonts.body}", system-ui, sans-serif`,
    '--rsvp-heading-weight': String(fonts.weight),
    '--rsvp-scale': SCALE_FACTOR[typography.scale],
    '--rsvp-hero-tint': `color-mix(in oklab, ${colors.accent} 30%, ${colors.surface})`,
    '--rsvp-skel': `color-mix(in oklab, ${colors.text} 12%, ${colors.surface})`,
  };
}

/** Loading and "not available" screens: the event's theme isn't known yet. */
export const NEUTRAL_STYLE = themeToStyle(DEFAULT_THEME, () => '');

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

export const fontStylesheetUrl = (pairing: FontPairingKey): string =>
  `https://fonts.googleapis.com/css2?${FONT_PAIRINGS[pairing].query}&display=swap`;

/** Adds a stylesheet <link> once; later calls with the same href do nothing. */
export function loadStylesheet(doc: Document, href: string): void {
  const links = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"]'));
  if (links.some((link) => link.getAttribute('href') === href)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  doc.head.appendChild(link);
}
