import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from './auth.service';

/** Signed-out → /signin (or /admin/login for admin routes); wrong role → home or /admin. */
export const roleGuard = (...roles: Role[]): CanActivateFn => () => {
  const user = inject(AuthService).user();
  const router = inject(Router);
  if (!user) {
    if (roles.includes('Admin') && roles.length === 1) {
      return router.parseUrl('/admin/login');
    }
    return router.parseUrl('/signin');
  }
  if (roles.includes(user.role)) return true;
  return router.parseUrl(user.role === 'Admin' ? '/admin' : '/');
};
