import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from './auth';

@Component({
  selector: 'app-login',
  host: { class: 'admin grid min-h-dvh place-items-center p-6' },
  template: `
    <form
      class="flex w-full max-w-[360px] flex-col gap-5"
      novalidate
      (submit)="submit($event, email.value, password.value)"
    >
      <div class="flex items-center gap-2.5 text-base font-semibold">
        <span aria-hidden="true" class="size-[22px] rounded-[5px] bg-ink"></span>RSVP
      </div>
      <div class="panel flex flex-col gap-[18px] p-7">
        <h1 class="text-xl leading-tight font-semibold">Sign in</h1>
        <label class="field text-[13px]">
          Email
          <input
            #email
            type="email"
            class="input text-base!"
            autocomplete="username"
            [disabled]="pending()"
            (input)="error.set('')"
          />
        </label>
        <label class="field text-[13px]">
          Password
          <input
            #password
            type="password"
            class="input text-base!"
            autocomplete="current-password"
            [disabled]="pending()"
            (input)="error.set('')"
          />
        </label>
        @if (error()) {
          <p role="alert" class="field-error">{{ error() }}</p>
        }
        <button type="submit" class="btn btn-primary" [disabled]="pending()">
          {{ pending() ? 'Signing in…' : 'Sign in' }}
        </button>
      </div>
    </form>
  `,
})
export default class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly pending = signal(false);
  protected readonly error = signal('');

  protected async submit(event: SubmitEvent, rawEmail: string, password: string): Promise<void> {
    event.preventDefault();
    const email = rawEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Enter a valid email address.');
    if (!password) return this.error.set('Enter your password.');

    this.pending.set(true);
    const error = await this.auth.signIn(email, password);
    this.pending.set(false);
    if (error) return this.error.set(error);
    await this.router.navigateByUrl('/admin');
  }
}
