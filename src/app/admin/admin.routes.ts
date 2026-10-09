import { DOCUMENT, inject, provideEnvironmentInitializer } from '@angular/core';
import { Routes } from '@angular/router';
import { loadStylesheet } from '../theme';

const ADMIN_FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

export default [
  {
    path: '',
    // Admin fonts load with the admin chunk, never on guest pages.
    providers: [provideEnvironmentInitializer(() => loadStylesheet(inject(DOCUMENT), ADMIN_FONTS))],
    children: [
      { path: 'login', title: 'Sign in · RSVP', loadComponent: () => import('./login') },
      { path: '', title: 'Events · RSVP', loadComponent: () => import('./dashboard') },
    ],
  },
] satisfies Routes;
