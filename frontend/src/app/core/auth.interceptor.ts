import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { AuthService } from './auth.service';
import { CONFIG } from './config';

/** Adds the JWT to API calls; an expired/invalid token (401) signs the user out. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!req.url.startsWith('/api')) return next(req);
  const url = CONFIG.apiUrl + req.url; // '' = same site
  const token = auth.token();
  if (!token) return next(req.clone({ url }));

  return next(req.clone({ url, setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
    tap({ error: e => { if (e.status === 401) auth.signOut(); } }),
  );
};
