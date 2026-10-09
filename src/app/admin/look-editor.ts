import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DOCUMENT, inject, input, model, output, signal } from '@angular/core';
import { IMAGE_BUCKET, publicImageUrl, SUPABASE } from '../supabase';
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
} from '../theme';
import { AdminUi } from './ui';

type ColorKey = keyof EventTheme['colors'] | 'gradientTo';
type ImageKind = 'hero' | 'background';

/** Card colors with a contrast check; the page background has its own control. */
type CheckedColor = Exclude<keyof EventTheme['colors'], 'background'>;

const COLOR_ROWS: { key: CheckedColor; label: string; hint: string }[] = [
  { key: 'primary', label: 'Primary', hint: 'Buttons, selected reply' },
  { key: 'accent', label: 'Accent', hint: 'Highlights, dividers, focus ring' },
  { key: 'text', label: 'Text', hint: 'Headings and body' },
  { key: 'surface', label: 'Surface', hint: 'Card fill' },
];

const LABELS = {
  scale: { sm: 'S', md: 'M', lg: 'L' },
  card: { solid: 'Solid', glass: 'Glass', outline: 'Outline', none: 'None' },
  radius: { none: 'None', sm: 'S', lg: 'L', xl: 'XL' },
  button: { solid: 'Solid', outline: 'Outline', pill: 'Pill' },
  background: { color: 'Solid', gradient: 'Gradient', image: 'Image' },
} as const;

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
  template: `
    @let t = theme();
    <div class="flex max-w-[640px] flex-col gap-[30px]">
      <section class="flex flex-col gap-2.5">
        <h3 class="font-semibold">Start from a preset</h3>
        <div class="flex flex-wrap gap-1.5">
          @for (p of presets; track p.key) {
            <button type="button" class="btn btn-sm rounded-full pl-2" (click)="applyPreset(p.key)">
              <span
                aria-hidden="true"
                class="size-[18px] rounded-full"
                [style.background]="
                  'linear-gradient(135deg, ' +
                  p.theme.colors.primary +
                  ' 50%, ' +
                  p.theme.colors.accent +
                  ' 50%)'
                "
              ></span>
              {{ p.label }}
            </button>
          }
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="font-semibold">Layout</h3>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
          @for (l of layouts; track l.value) {
            @let on = t.layout === l.value;
            <button
              type="button"
              class="flex cursor-pointer items-center gap-3.5 rounded-[10px] bg-white p-3 text-left"
              [class]="on ? 'border-2 border-ink' : 'm-px border border-line'"
              [attr.aria-pressed]="on"
              (click)="setLayout(l.value)"
            >
              <span
                aria-hidden="true"
                class="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-track"
              >
                @if (l.value === 'card') {
                  <span
                    class="absolute inset-x-1.5 top-[5px] h-[22px] rounded-xs bg-[#bdbcb6]"
                  ></span>
                  <span
                    class="absolute inset-x-1.5 top-[30px] bottom-[5px] rounded-xs bg-white"
                  ></span>
                } @else {
                  <span class="absolute inset-x-0 top-0 h-10 bg-[#bdbcb6]"></span>
                  <span class="absolute inset-x-1 top-[34px] bottom-0 rounded-t-xs bg-white"></span>
                }
              </span>
              <span class="flex flex-col gap-0.5">
                <span class="font-semibold">{{ l.label }}</span>
                <span class="hint">{{ l.hint }}</span>
              </span>
            </button>
          }
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="font-semibold">Colors</h3>
        <div class="panel flex flex-col">
          @for (row of colorRows(); track row.key) {
            <div class="flex flex-col gap-2 border-b border-[#efeeea] px-3.5 py-3 last:border-b-0">
              <div class="grid grid-cols-[40px_minmax(0,1fr)_104px] items-center gap-3">
                <ng-container
                  [ngTemplateOutlet]="picker"
                  [ngTemplateOutletContext]="{ key: row.key, label: row.label }"
                />
                <span class="flex min-w-0 flex-col">
                  <span class="font-medium">{{ row.label }}</span>
                  <span class="text-xs text-muted">{{ row.hint }}</span>
                </span>
                <ng-container
                  [ngTemplateOutlet]="hex"
                  [ngTemplateOutletContext]="{ key: row.key, label: row.label }"
                />
              </div>
              <div class="flex justify-between gap-2 pl-[52px] text-xs">
                <span class="text-muted">{{ row.check }}</span>
                <span class="font-mono font-medium" [class]="row.ok ? 'text-yes' : 'text-danger'">
                  {{ row.ratio }}
                </span>
              </div>
              @if (row.warning) {
                <p role="alert" class="warning ml-[52px]">
                  <span aria-hidden="true" class="font-bold">!</span>{{ row.warning }}
                </p>
              }
            </div>
          }
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h3 class="font-semibold">Background</h3>
        <div class="segmented self-start">
          @for (kind of backgroundKinds; track kind) {
            <button
              type="button"
              [attr.aria-pressed]="t.background.kind === kind"
              (click)="set('background', { kind })"
            >
              {{ labels.background[kind] }}
            </button>
          }
        </div>
        @if (t.background.kind === 'image') {
          <div class="panel grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4 p-3.5">
            <div
              class="h-[90px] rounded-md bg-cover bg-center"
              [style.background-image]="imageCss(t.background.imagePath)"
            ></div>
            <div class="flex min-w-0 flex-col gap-3">
              <ng-container
                [ngTemplateOutlet]="uploader"
                [ngTemplateOutletContext]="{
                  kind: 'background',
                  path: t.background.imagePath,
                  noun: 'photo',
                }"
              />
              <label class="grid grid-cols-[64px_1fr_44px] items-center gap-2.5 text-[13px]">
                Overlay
                <input
                  #overlay
                  type="range"
                  min="0"
                  max="80"
                  class="accent-ink"
                  [value]="round(t.background.overlay * 100)"
                  (input)="set('background', { overlay: +overlay.value / 100 })"
                />
                <span class="font-mono">{{ round(t.background.overlay * 100) }}%</span>
              </label>
              <label class="grid grid-cols-[64px_1fr_44px] items-center gap-2.5 text-[13px]">
                Blur
                <input
                  #blur
                  type="range"
                  min="0"
                  max="12"
                  class="accent-ink"
                  [value]="t.background.blur"
                  (input)="set('background', { blur: +blur.value })"
                />
                <span class="font-mono">{{ t.background.blur }}px</span>
              </label>
              <p class="text-xs text-muted">
                The form always sits on the card surface, so it stays readable whatever the photo.
              </p>
            </div>
          </div>
        } @else {
          <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <div class="flex flex-col gap-1.5 text-[13px] text-muted">
              {{ t.background.kind === 'gradient' ? 'From' : 'Color' }}
              <div class="flex items-center gap-2">
                <ng-container
                  [ngTemplateOutlet]="picker"
                  [ngTemplateOutletContext]="{ key: 'background', label: 'Background' }"
                />
                <ng-container
                  [ngTemplateOutlet]="hex"
                  [ngTemplateOutletContext]="{ key: 'background', label: 'Background' }"
                />
              </div>
            </div>
            @if (t.background.kind === 'gradient') {
              <div class="flex flex-col gap-1.5 text-[13px] text-muted">
                To
                <div class="flex items-center gap-2">
                  <ng-container
                    [ngTemplateOutlet]="picker"
                    [ngTemplateOutletContext]="{ key: 'gradientTo', label: 'Gradient end' }"
                  />
                  <ng-container
                    [ngTemplateOutlet]="hex"
                    [ngTemplateOutletContext]="{ key: 'gradientTo', label: 'Gradient end' }"
                  />
                </div>
              </div>
            }
          </div>
        }
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="font-semibold">Invitation image</h3>
        <div class="panel grid grid-cols-[96px_minmax(0,1fr)] gap-4 p-3.5">
          <div
            class="grid h-[120px] w-24 place-items-center rounded bg-cover bg-center"
            [style.background-image]="imageCss(t.hero.imagePath)"
          >
            @if (!t.hero.imagePath) {
              <span class="font-mono text-[10px] text-[#4a4a46]">none</span>
            }
          </div>
          <div class="flex min-w-0 flex-col gap-2.5">
            <ng-container
              [ngTemplateOutlet]="uploader"
              [ngTemplateOutletContext]="{ kind: 'hero', path: t.hero.imagePath, noun: 'image' }"
            />
            <label class="field text-[13px]">
              Alt text
              <input
                #alt
                class="input"
                maxlength="300"
                [value]="t.hero.alt"
                (input)="set('hero', { alt: alt.value })"
              />
              <span class="hint">
                If the image has text baked in, summarise it here for screen readers.
              </span>
            </label>
            @if (t.hero.imagePath && !t.hero.alt.trim()) {
              <p role="alert" class="warning">
                <span aria-hidden="true" class="font-bold">!</span>Add alt text so screen-reader
                users get the invitation too.
              </p>
            }
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-2.5">
        <h3 class="font-semibold">Fonts</h3>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          @for (f of fonts; track f.key) {
            @let on = t.typography.pairing === f.key;
            <button
              type="button"
              class="flex cursor-pointer flex-col items-start gap-1 rounded-lg bg-white px-3 pt-3 pb-2.5 text-left"
              [class]="on ? 'border-2 border-ink' : 'm-px border border-line'"
              [attr.aria-pressed]="on"
              (click)="set('typography', { pairing: f.key })"
            >
              <span
                class="text-xl leading-[1.1]"
                [style.font-family]="f.family"
                [style.font-weight]="f.weight"
              >
                {{ f.label }}
              </span>
              <span class="text-xs text-muted">{{ f.heading }} / {{ f.body }}</span>
            </button>
          }
        </div>
      </section>

      <section class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
        <h3 class="font-semibold">Text size</h3>
        <div class="segmented justify-self-start">
          @for (v of scales; track v) {
            <button
              type="button"
              [attr.aria-pressed]="t.typography.scale === v"
              (click)="set('typography', { scale: v })"
            >
              {{ labels.scale[v] }}
            </button>
          }
        </div>
        <h3 class="font-semibold">Card</h3>
        <div class="segmented justify-self-start">
          @for (v of cardStyles; track v) {
            <button
              type="button"
              [attr.aria-pressed]="t.card.style === v"
              (click)="set('card', { style: v })"
            >
              {{ labels.card[v] }}
            </button>
          }
        </div>
        <h3 class="font-semibold">Corners</h3>
        <div class="segmented justify-self-start">
          @for (v of radii; track v) {
            <button
              type="button"
              [attr.aria-pressed]="t.card.radius === v"
              (click)="set('card', { radius: v })"
            >
              {{ labels.radius[v] }}
            </button>
          }
        </div>
        <h3 class="font-semibold">Buttons</h3>
        <div class="segmented justify-self-start">
          @for (v of buttonStyles; track v) {
            <button
              type="button"
              [attr.aria-pressed]="t.button.style === v"
              (click)="set('button', { style: v })"
            >
              {{ labels.button[v] }}
            </button>
          }
        </div>
      </section>
    </div>

    <ng-template #picker let-key="key" let-label="label">
      <input
        #pick
        type="color"
        class="size-10 shrink-0 cursor-pointer rounded-md border border-black/15 bg-transparent p-0"
        [value]="color(key)"
        [attr.aria-label]="label + ' color picker'"
        (input)="setColor(key, pick.value)"
      />
    </ng-template>

    <ng-template #hex let-key="key" let-label="label">
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <input
          #hexInput
          class="input h-10 font-mono text-sm!"
          spellcheck="false"
          [value]="hexText(key)"
          [attr.aria-label]="label + ' hex'"
          [attr.aria-invalid]="!validHex(key)"
          (input)="typeHex(key, hexInput.value)"
          (blur)="forgetHex(key)"
        />
        @if (!validHex(key)) {
          <span class="field-error">Use a 6-digit hex like #5B2BD6.</span>
        }
      </span>
    </ng-template>

    <ng-template #uploader let-kind="kind" let-path="path" let-noun="noun">
      <div class="flex flex-wrap gap-1.5">
        <label
          class="btn btn-sm relative border-line-strong"
          [class.opacity-60]="uploading() === kind"
        >
          {{ uploading() === kind ? 'Uploading…' : (path ? 'Replace ' : 'Upload ') + noun }}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="absolute size-px opacity-0"
            [disabled]="uploading() !== null"
            (change)="upload(kind, $event)"
          />
        </label>
        @if (path) {
          <button type="button" class="btn btn-sm" (click)="removeImage(kind)">Remove</button>
        }
      </div>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class LookEditor {
  /** Two-way bound, so consecutive edits always build on the latest theme. */
  readonly theme = model.required<EventTheme>();
  readonly eventId = input.required<string>();
  /** Storage paths uploaded in this session, so the editor can clean up unused ones. */
  readonly uploaded = output<string>();

  private readonly supabase = inject(SUPABASE);
  private readonly document = inject(DOCUMENT);
  private readonly ui = inject(AdminUi);

  protected readonly labels = LABELS;
  protected readonly presets = Object.entries(THEME_PRESETS).map(([key, p]) => ({ key, ...p }));
  protected readonly layouts = [
    { value: 'card', label: 'Card', hint: 'Invite on top, details in a card' },
    { value: 'poster', label: 'Poster', hint: 'Invite fills the first screen' },
  ] as const;
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

  /** Contrast checks from the design; with no card, text sits on the page background. */
  protected readonly colorRows = computed(() => {
    const { colors, card, background } = this.theme();
    const noCard = card.style === 'none';
    const ground = noCard
      ? background.kind === 'image'
        ? null
        : colors.background
      : colors.surface;
    const groundName = noCard ? 'background' : 'card';
    const onPrimary = onColor(colors.primary);
    const checks = {
      primary: [
        contrastRatio(onPrimary, colors.primary),
        4.5,
        `${onPrimary === '#ffffff' ? 'White' : 'Dark'} label on primary`,
        'Pick a darker or lighter primary.',
      ],
      accent: [
        ground ? contrastRatio(colors.accent, ground) : null,
        3,
        `Focus ring on ${groundName}`,
        'Darken the accent.',
      ],
      text: [
        ground ? contrastRatio(colors.text, ground) : null,
        4.5,
        `Text on ${groundName}`,
        'Darken the text or change the card fill.',
      ],
      surface: [
        ground ? contrastRatio(colors.primary, ground) : null,
        3,
        `Selected reply on ${groundName}`,
        'Make primary and card more different.',
      ],
    } as const;

    return COLOR_ROWS.map(({ key, label, hint }) => {
      const [ratio, min, check, fix] = checks[key];
      const onPhoto = ratio === null;
      const ok = onPhoto || ratio >= min;
      return {
        key,
        label,
        hint:
          key === 'surface' && card.style === 'glass' ? 'Card fill, translucent for glass' : hint,
        check,
        ok: !onPhoto && ok,
        ratio: onPhoto ? 'check on photo' : `${ratio.toFixed(1)}:1 · ${ok ? 'AA' : 'fails AA'}`,
        warning: onPhoto
          ? key === 'text'
            ? 'With no card, text sits directly on the photo. Pick a card style so the form stays readable.'
            : ''
          : ok
            ? ''
            : `${check} is ${ratio.toFixed(1)}:1; WCAG AA needs ${min}:1. ${fix}`,
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
    const { theme } = THEME_PRESETS[key];
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
      ? `url("${publicImageUrl(this.supabase, path)}")`
      : 'repeating-linear-gradient(135deg, rgb(0 0 0 / 0.07) 0 8px, transparent 8px 16px), linear-gradient(#ebeae6, #ebeae6)';
  }

  protected async upload(kind: ImageKind, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.uploading.set(kind);
    try {
      const blob = await toWebImage(file, this.document);
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${this.eventId()}/${kind}-${crypto.randomUUID()}.${ext}`;
      const { error } = await this.supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error;
      this.uploaded.emit(path);
      this.setImage(kind, path);
    } catch {
      this.ui.toast("That file couldn't be uploaded. Try a JPEG, PNG or WebP image.");
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
