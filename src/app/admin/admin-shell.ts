import { afterRenderEffect, Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Auth } from './auth';
import { LanguageSwitch } from './language-switch';
import { AdminUi } from './ui';

@Component({
  selector: 'app-admin-shell',
  imports: [LanguageSwitch, RouterLink, RouterOutlet, TranslatePipe],
  host: { class: 'admin block min-h-dvh' },
  template: `
    <header
      class="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-[max(16px,env(safe-area-inset-left))]"
    >
      <a routerLink="/admin" class="flex min-h-11 items-center gap-2.5 font-semibold">
        <span aria-hidden="true" class="size-5 rounded-[5px] bg-ink"></span>RSVP
      </a>
      <div class="flex min-w-0 items-center gap-3 text-muted">
        <span class="hidden truncate sm:inline">{{ auth.email() }}</span>
        <app-language-switch />
        <button type="button" class="btn btn-sm" (click)="auth.signOut()">
          {{ 'admin.signOut' | translate }}
        </button>
      </div>
    </header>

    <router-outlet />

    <dialog
      #dialog
      class="m-auto w-[calc(100%-32px)] max-w-[420px] rounded-xl bg-white p-6 text-ink shadow-[0_24px_60px_rgb(0_0_0/0.25)] backdrop:bg-ink/45"
      aria-labelledby="dialog-title"
      (cancel)="$event.preventDefault(); ui.closeDialog(false)"
      (click)="$event.target === dialog && ui.closeDialog(false)"
    >
      @if (ui.dialog(); as d) {
        <div class="flex flex-col gap-3.5">
          <h2 id="dialog-title" class="text-lg leading-snug font-semibold">{{ d.title }}</h2>
          <p class="text-muted">{{ d.body }}</p>
          <div class="mt-1.5 flex justify-end gap-2">
            <button type="button" class="btn" (click)="ui.closeDialog(false)">
              {{ 'common.cancel' | translate }}
            </button>
            <button
              type="button"
              autofocus
              class="btn"
              [class]="d.danger ? 'btn-danger' : 'btn-primary'"
              (click)="ui.closeDialog(true)"
            >
              {{ d.confirm }}
            </button>
          </div>
        </div>
      }
    </dialog>

    <div
      role="status"
      class="pointer-events-none fixed bottom-[calc(24px+env(safe-area-inset-bottom))] left-1/2 z-60 -translate-x-1/2"
    >
      @if (ui.toastMessage(); as message) {
        <p class="rounded-lg bg-ink px-4 py-2.5 text-white shadow-[0_8px_24px_rgb(0_0_0/0.2)]">
          {{ message }}
        </p>
      }
    </div>
  `,
})
export default class AdminShell {
  protected readonly auth = inject(Auth);
  protected readonly ui = inject(AdminUi);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // After render, so the dialog's buttons exist and autofocus lands on the confirm button.
    afterRenderEffect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.ui.dialog() && !dialog.open) dialog.showModal();
      if (!this.ui.dialog() && dialog.open) dialog.close();
    });
  }
}
