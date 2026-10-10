import { inject, Injectable, signal } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { AuthApi } from '../api/auth-api';

/**
 * Admin session for the UI: who is signed in and whether they may manage events. The
 * backend checks admin rights again on every admin call, so this only picks the screen.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private adminCheck: { userId: string; result: Promise<boolean> } | null = null;

  readonly email = signal('');

  constructor() {
    this.api.onChange((user, signedOut) => {
      this.email.set(user?.email ?? '');
      if (signedOut) {
        this.adminCheck = null;
        void this.router.navigateByUrl('/admin/login');
      }
    });
  }

  async isAdmin(): Promise<boolean> {
    const user = await this.api.currentUser();
    if (!user) return false;
    if (this.adminCheck?.userId !== user.id) {
      const result = this.api.isAdmin().catch(() => {
        this.adminCheck = null; // don't cache a network failure
        return false;
      });
      this.adminCheck = { userId: user.id, result };
    }
    return this.adminCheck.result;
  }

  /** Resolves to an error's translation key, or null when signed in as an admin. */
  async signIn(email: string, password: string): Promise<string | null> {
    const outcome = await this.api.signIn(email, password);
    if (outcome === 'wrong_credentials') return 'admin.login.wrongCredentials';
    if (outcome === 'failed') return 'admin.login.failed';
    if (await this.isAdmin()) return null;
    await this.api.signOut();
    return 'admin.login.notAdmin';
  }

  signOut(): Promise<void> {
    return this.api.signOut();
  }
}

// inject() must run before the first await, while the injection context is active.
export const adminGuard: CanMatchFn = () => {
  const [auth, router] = [inject(Auth), inject(Router)];
  return auth.isAdmin().then((ok) => ok || router.createUrlTree(['/admin/login']));
};

export const signedOutGuard: CanMatchFn = () => {
  const [auth, router] = [inject(Auth), inject(Router)];
  return auth.isAdmin().then((ok) => !ok || router.createUrlTree(['/admin']));
};
