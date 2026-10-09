import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { type InterpolationParameters, TranslateService } from '@ngx-translate/core';

/** Translation keys for the dialog's texts, plus the parameters they share. */
export interface ConfirmOptions {
  title: string;
  body: string;
  confirm: string;
  params?: InterpolationParameters;
  danger?: boolean;
}

interface OpenDialog {
  title: string;
  body: string;
  confirm: string;
  danger: boolean;
  resolve: (confirmed: boolean) => void;
}

/** Toast messages, the confirm dialog and copy-link, rendered once by the admin shell. */
@Injectable({ providedIn: 'root' })
export class AdminUi {
  private readonly document = inject(DOCUMENT);
  private readonly translate = inject(TranslateService);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly toastMessage = signal('');
  readonly dialog = signal<OpenDialog | null>(null);

  /** Shows a translated message for a couple of seconds. */
  toast(key: string, params?: InterpolationParameters): void {
    clearTimeout(this.toastTimer);
    this.toastMessage.set(this.translate.instant(key, params) as string);
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 2200);
  }

  confirm({ title, body, confirm, params, danger = false }: ConfirmOptions): Promise<boolean> {
    this.dialog()?.resolve(false);
    const t = (key: string) => this.translate.instant(key, params) as string;
    return new Promise((resolve) =>
      this.dialog.set({ title: t(title), body: t(body), confirm: t(confirm), danger, resolve }),
    );
  }

  closeDialog(confirmed: boolean): void {
    this.dialog()?.resolve(confirmed);
    this.dialog.set(null);
  }

  /** The guest link for an event, e.g. https://keimdja.github.io/rsvp/maya-6. */
  eventUrl(slug: string): string {
    return new URL(slug, this.document.baseURI).href;
  }

  /** The path guests see before the slug, e.g. /rsvp/. */
  basePath(): string {
    return new URL(this.document.baseURI).pathname;
  }

  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      this.toast('admin.copyFailed');
      return false;
    }
  }
}

/** "Copied ✓" feedback for one item at a time. */
export function copiedState() {
  const copied = signal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    copied: copied.asReadonly(),
    mark(id: string) {
      clearTimeout(timer);
      copied.set(id);
      timer = setTimeout(() => copied.set(null), 1600);
    },
  };
}
