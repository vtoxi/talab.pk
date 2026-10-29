import { Routes } from '@angular/router';
import { roleGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/login.page').then(m => m.AdminLoginPage),
  },
  {
    path: 'admin',
    canActivate: [roleGuard('Admin')],
    loadComponent: () => import('./admin/admin-layout').then(m => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./admin/dashboard.page').then(m => m.DashboardPage) },
      { path: 'requests', loadComponent: () => import('./admin/requests.page').then(m => m.AdminRequestsPage) },
      { path: 'verifications', loadComponent: () => import('./admin/verifications.page').then(m => m.VerificationsPage) },
      { path: 'verifications/:id', loadComponent: () => import('./admin/verification-detail.page').then(m => m.VerificationDetailPage) },
      { path: 'users', loadComponent: () => import('./admin/users.page').then(m => m.UsersPage) },
      { path: 'settings', loadComponent: () => import('./admin/settings.page').then(m => m.SettingsPage) },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./pages/public-layout').then(m => m.PublicLayout),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/home.page').then(m => m.HomePage) },
      { path: 'signin', loadComponent: () => import('./pages/signin.page').then(m => m.SigninPage) },
      { path: 'post', canActivate: [roleGuard('Tenant')], loadComponent: () => import('./pages/post-request.page').then(m => m.PostRequestPage) },
      { path: 'my-request', canActivate: [roleGuard('Tenant')], loadComponent: () => import('./pages/my-request.page').then(m => m.MyRequestPage) },
      { path: 'notifications', canActivate: [roleGuard('Tenant', 'Owner', 'Agent')], loadComponent: () => import('./pages/notifications.page').then(m => m.NotificationsPage) },
      { path: 'owner/verify', canActivate: [roleGuard('Owner')], loadComponent: () => import('./pages/verify.page').then(m => m.VerifyPage) },
      { path: 'owner/offer/:requestId', canActivate: [roleGuard('Owner')], loadComponent: () => import('./pages/offer-form.page').then(m => m.OfferFormPage) },
      { path: 'offers/:id', canActivate: [roleGuard('Tenant', 'Owner')], loadComponent: () => import('./pages/thread.page').then(m => m.ThreadPage) },
      { path: 'offers/:id/agreement', canActivate: [roleGuard('Tenant', 'Owner')], loadComponent: () => import('./pages/agreement.page').then(m => m.AgreementPage) },
      { path: 'owner', canActivate: [roleGuard('Owner', 'Agent')], loadComponent: () => import('./pages/owner.page').then(m => m.OwnerPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
