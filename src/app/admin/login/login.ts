import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Auth } from '../auth';
import { LanguageSwitch } from '../../language-switch/language-switch';
import { Logo } from '../../logo/logo';

@Component({
  selector: 'app-login',
  imports: [LanguageSwitch, Logo, TranslatePipe],
  host: { class: 'admin grid min-h-dvh place-items-center p-6' },
  templateUrl: './login.html',
})
export default class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly pending = signal(false);
  protected readonly error = signal('');

  protected async submit(event: SubmitEvent, rawEmail: string, password: string): Promise<void> {
    event.preventDefault();
    const email = rawEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('admin.login.invalidEmail');
    if (!password) return this.error.set('admin.login.emptyPassword');

    this.pending.set(true);
    const error = await this.auth.signIn(email, password);
    this.pending.set(false);
    if (error) return this.error.set(error);
    await this.router.navigateByUrl('/admin');
  }
}
