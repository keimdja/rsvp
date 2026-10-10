import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Component, computed, DOCUMENT, inject, input, model, output, signal } from '@angular/core';
import { AdminApi } from '../../api/admin-api';
import { PublicApi } from '../../api/public-api';
import {
  BUTTON_STYLES,
  CARD_STYLES,
  contrastRatio,
  type EventTheme,
  FONT_PAIRINGS,
  type FontPairingKey,
  HEX_COLOR,
  loadStylesheet,
  onColor,
  RADII,
  SCALES,
  THEME_PRESETS,
} from '../../theme';
import { AdminUi } from '../ui';

type ColorKey = keyof EventTheme['colors'] | 'gradientTo';
type ImageKind = 'hero' | 'background';

/** Card colors with a contrast check; the page background has its own control. */
type CheckedColor = Exclude<keyof EventTheme['colors'], 'background'>;

const COLOR_ROWS: CheckedColor[] = ['primary', 'accent', 'text', 'surface'];

const ALL_FONTS_URL = `https://fonts.googleapis.com/css2?${Object.values(FONT_PAIRINGS)
  .map((f) => f.query)
  .join('&')}&display=swap`;

const IMAGE_MAX_PX = 1600;

/** Downscales and re-encodes an upload (WebP, or JPEG where WebP encoding isn't supported). */
async function toWebImage(file: File, doc: Document): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  const webp = await encode('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('Image encoding failed');
  return jpeg;
}

/** The editor's Look tab. Emits a complete theme on every change. */
@Component({
  selector: 'app-look-editor',
  templateUrl: './look-editor.html',
  imports: [NgTemplateOutlet, TranslatePipe],
})
export class LookEditor {
  /** Two-way bound, so consecutive edits always build on the latest theme. */
  readonly theme = model.required<EventTheme>();
  readonly eventId = input.required<string>();
  /** Storage paths uploaded in this session, so the editor can clean up unused ones. */
  readonly uploaded = output<string>();

  private readonly api = inject(AdminApi);
  private readonly publicApi = inject(PublicApi);
  private readonly document = inject(DOCUMENT);
  private readonly ui = inject(AdminUi);
  private readonly translate = inject(TranslateService);

  protected readonly presets = Object.entries(THEME_PRESETS).map(([key, theme]) => ({
    key,
    theme,
  }));
  protected readonly layouts = ['card', 'poster'] as const;
  protected readonly fonts = (Object.keys(FONT_PAIRINGS) as FontPairingKey[]).map((key) => ({
    key,
    ...FONT_PAIRINGS[key],
    family: `"${FONT_PAIRINGS[key].heading}"`,
  }));
  protected readonly backgroundKinds = ['color', 'gradient', 'image'] as const;
  protected readonly scales = SCALES;
  protected readonly cardStyles = CARD_STYLES;
  protected readonly radii = RADII;
  protected readonly buttonStyles = BUTTON_STYLES;
  protected readonly round = Math.round;

  protected readonly uploading = signal<ImageKind | null>(null);
  /** Hex text being typed that isn't a valid color yet, per field. */
  private readonly hexDrafts = signal<Partial<Record<ColorKey, string>>>({});

  constructor() {
    loadStylesheet(this.document, ALL_FONTS_URL); // font cards preview each pairing
  }

  /**
   * Contrast checks from the design; with no card, text sits on the page background.
   * Texts come from instant(), which re-evaluates when the admin switches language.
   */
  protected readonly colorRows = computed(() => {
    const { colors, card, background } = this.theme();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.translate.instant(`admin.look.${key}`, params) as string;
    const noCard = card.style === 'none';
    const ground = noCard
      ? background.kind === 'image'
        ? null
        : colors.background
      : colors.surface;
    const on = { ground: t(noCard ? 'checks.background' : 'checks.card') };
    const onPrimary = onColor(colors.primary);
    const checks: Record<CheckedColor, [ratio: number | null, min: number, check: string]> = {
      primary: [
        contrastRatio(onPrimary, colors.primary),
        4.5,
        t(onPrimary === '#ffffff' ? 'checks.whiteLabel' : 'checks.darkLabel'),
      ],
      accent: [ground ? contrastRatio(colors.accent, ground) : null, 3, t('checks.focusRing', on)],
      text: [ground ? contrastRatio(colors.text, ground) : null, 4.5, t('checks.text', on)],
      surface: [ground ? contrastRatio(colors.primary, ground) : null, 3, t('checks.selected', on)],
    };

    return COLOR_ROWS.map((key) => {
      const [ratio, min, check] = checks[key];
      if (ratio === null) {
        return {
          key,
          hint: t(`colorHints.${key}`),
          check,
          ok: false,
          ratio: t('onPhoto'),
          warning: key === 'text' ? t('photoNoCard') : '',
        };
      }
      const ok = ratio >= min;
      const shown = ratio.toFixed(1);
      return {
        key,
        hint: t(
          key === 'surface' && card.style === 'glass'
            ? 'colorHints.surfaceGlass'
            : `colorHints.${key}`,
        ),
        check,
        ok,
        ratio: t(ok ? 'passes' : 'fails', { ratio: shown }),
        warning: ok
          ? ''
          : t('contrastWarning', { check, ratio: shown, min, fix: t(`fixes.${key}`) }),
      };
    });
  });

  protected setLayout(layout: EventTheme['layout']): void {
    this.theme.update((t) => ({ ...t, layout }));
  }

  /** Merges a change into one section of the theme (colors, background, hero, …). */
  protected set<K extends Exclude<keyof EventTheme, 'version' | 'layout'>>(
    section: K,
    change: Partial<EventTheme[K]>,
  ): void {
    this.theme.update((t) => ({ ...t, [section]: { ...t[section], ...change } }));
  }

  protected applyPreset(key: string): void {
    const theme = THEME_PRESETS[key];
    this.hexDrafts.set({});
    this.theme.update((current) => ({
      ...theme,
      hero: current.hero,
      background: { ...theme.background, imagePath: current.background.imagePath },
    }));
  }

  // Colors -----------------------------------------------------------------

  protected color(key: ColorKey): string {
    const t = this.theme();
    return key === 'gradientTo' ? t.background.gradientTo : t.colors[key];
  }

  protected setColor(key: ColorKey, value: string): void {
    const color = value.toLowerCase();
    this.forgetHex(key);
    if (key === 'gradientTo') this.set('background', { gradientTo: color });
    else this.set('colors', { [key]: color });
  }

  protected hexText(key: ColorKey): string {
    return this.hexDrafts()[key] ?? this.color(key);
  }

  protected validHex(key: ColorKey): boolean {
    return HEX_COLOR.test(this.hexText(key));
  }

  protected typeHex(key: ColorKey, raw: string): void {
    const value = raw.trim();
    if (HEX_COLOR.test(value)) this.setColor(key, value);
    else this.hexDrafts.update((drafts) => ({ ...drafts, [key]: value }));
  }

  /** On blur an unfinished hex falls back to the last valid color. */
  protected forgetHex(key: ColorKey): void {
    this.hexDrafts.update(({ [key]: _, ...rest }) => rest);
  }

  // Images -----------------------------------------------------------------

  protected imageCss(path: string | undefined): string {
    return path
      ? `url("${this.publicApi.imageUrl(path)}")`
      : 'repeating-linear-gradient(135deg, rgb(0 0 0 / 0.07) 0 8px, transparent 8px 16px), linear-gradient(#ebeae6, #ebeae6)';
  }

  protected async upload(kind: ImageKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.uploading.set(kind);
    try {
      const path = await this.api.uploadImage(
        this.eventId(),
        kind,
        await toWebImage(file, this.document),
      );
      this.uploaded.emit(path);
      this.setImage(kind, path);
    } catch {
      this.ui.toast('admin.look.uploadFailed');
    } finally {
      this.uploading.set(null);
    }
  }

  protected removeImage(kind: ImageKind): void {
    this.setImage(kind, undefined);
  }

  private setImage(kind: ImageKind, imagePath: string | undefined): void {
    if (kind === 'hero') this.set('hero', { imagePath });
    else this.set('background', { imagePath });
  }
}
