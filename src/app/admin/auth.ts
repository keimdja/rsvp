import { inject, Injectable, signal } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { SUPABASE } from '../supabase';

/**
 * Admin session. Signing in proves who someone is; the admins table (readable only for
 * one's own row) decides whether they may manage events. RLS enforces the same rule on
 * every query, so this check only decides which screen to show.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly supabase = inject(SUPABASE);
  private readonly router = inject(Router);
  private adminCheck: { userId: string; result: Promise<boolean> } | null = null;

  readonly email = signal('');

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.email.set(session?.user.email ?? '');
      if (event === 'SIGNED_OUT') {
        this.adminCheck = null;
        void this.router.navigateByUrl('/admin/login');
      }
    });
  }

  async isAdmin(): Promise<boolean> {
    const { data } = await this.supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    if (this.adminCheck?.userId !== userId) {
      this.adminCheck = { userId, result: this.lookUpAdmin(userId) };
    }
    return this.adminCheck.result;
  }

  /** Resolves to an error message, or null when signed in as an admin. */
  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return error.status === 400
        ? 'Email or password is incorrect.'
        : "Couldn't sign in. Try again.";
    }
    if (await this.isAdmin()) return null;
    await this.supabase.auth.signOut();
    return "This account doesn't have admin access.";
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  private async lookUpAdmin(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      this.adminCheck = null; // don't cache a network failure
      return false;
    }
    return data !== null;
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
