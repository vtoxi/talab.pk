import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export type Role = 'Tenant' | 'Owner' | 'Agent' | 'Admin';
export type Intent = 'Tenant' | 'Owner';
export interface Me { id: string; name: string; email: string; role: Role; verified: boolean }
interface AuthResult { token: string; user: Me }

const KEY = 'talab.auth';
const INTENT = 'talab.intent';

function read(): AuthResult | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private state = signal<AuthResult | null>(read());
  user = computed(() => this.state()?.user ?? null);
  token = computed(() => this.state()?.token ?? null);
  intent = signal<Intent>(localStorage.getItem(INTENT) === 'Owner' ? 'Owner' : 'Tenant');

  /** Where each role starts. */
  homeFor(role: Role) {
    return { Tenant: '/post', Owner: '/owner', Admin: '/admin', Agent: '/owner' }[role];
  }

  /** Landing page choice: remember it, then sign in or switch role as needed. */
  choose(intent: Intent) {
    this.intent.set(intent);
    localStorage.setItem(INTENT, intent);
    const u = this.user();
    if (!u) return this.router.navigateByUrl('/signin');
    if (u.role === intent || u.role === 'Admin') return this.router.navigateByUrl(this.homeFor(u.role));
    return this.setRole(intent).subscribe(r => this.router.navigateByUrl(this.homeFor(r.user.role)));
  }

  google(idToken: string) {
    return this.http.post<AuthResult>('/api/auth/google', { idToken, intent: this.intent() }).pipe(tap(r => this.store(r)));
  }

  dev(email: string, name: string) {
    return this.http.post<AuthResult>('/api/auth/dev', { email, name, intent: this.intent() }).pipe(tap(r => this.store(r)));
  }

  setRole(role: Intent): Observable<AuthResult> {
    return this.http.post<AuthResult>('/api/auth/role', JSON.stringify(role),
      { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }).pipe(tap(r => this.store(r)));
  }

  signOut() {
    this.state.set(null);
    try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    this.router.navigateByUrl('/');
  }

  private store(r: AuthResult) {
    this.state.set(r);
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage unavailable */ }
  }
}
