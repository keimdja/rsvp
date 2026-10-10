import { inject, Injectable } from '@angular/core';
import { SUPABASE, unwrap } from './supabase';

export interface SignedInUser {
  id: string;
  email: string;
}

/** Sign-in endpoints (Supabase Auth) and the admin check (current_user_is_admin). */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly supabase = inject(SUPABASE);

  async currentUser(): Promise<SignedInUser | null> {
    const { data } = await this.supabase.auth.getSession();
    const user = data.session?.user;
    return user ? { id: user.id, email: user.email ?? '' } : null;
  }

  /** Calls `listener` now and on every change; `signedOut` is true when a session ends. */
  onChange(listener: (user: SignedInUser | null, signedOut: boolean) => void): void {
    this.supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      listener(user ? { id: user.id, email: user.email ?? '' } : null, event === 'SIGNED_OUT');
    });
  }

  async signIn(email: string, password: string): Promise<'ok' | 'wrong_credentials' | 'failed'> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (!error) return 'ok';
    return error.status === 400 ? 'wrong_credentials' : 'failed';
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  async isAdmin(): Promise<boolean> {
    return unwrap(await this.supabase.rpc('current_user_is_admin'));
  }
}
