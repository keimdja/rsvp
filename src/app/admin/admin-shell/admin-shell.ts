import { afterRenderEffect, Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Auth } from '../auth';
import { LanguageSwitch } from '../../language-switch/language-switch';
import { Logo } from '../../logo/logo';
import { AdminUi } from '../ui';

@Component({
  selector: 'app-admin-shell',
  imports: [LanguageSwitch, Logo, RouterLink, RouterOutlet, TranslatePipe],
  host: { class: 'admin block min-h-dvh' },
  templateUrl: './admin-shell.html',
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
