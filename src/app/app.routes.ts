import { Routes } from '@angular/router';

// Each entry is its own lazy chunk, so guests never download admin code.
// 'admin' must come before ':slug' (the database also reserves the slug 'admin').
export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'RSVP', loadComponent: () => import('./home') },
  { path: 'admin', loadChildren: () => import('./admin/admin.routes') },
  { path: ':slug', loadComponent: () => import('./guest/rsvp-page') },
  { path: '**', title: 'RSVP', loadComponent: () => import('./not-found') },
];
