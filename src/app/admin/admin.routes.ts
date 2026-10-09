import { DOCUMENT, inject, provideEnvironmentInitializer } from '@angular/core';
import { Routes } from '@angular/router';
import { loadStylesheet } from '../theme';
import { adminGuard, signedOutGuard } from './auth';
import type EventEditor from './event-editor';

const ADMIN_FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

export default [
  {
    path: '',
    // Admin fonts load with the admin chunk, never on guest pages.
    providers: [provideEnvironmentInitializer(() => loadStylesheet(inject(DOCUMENT), ADMIN_FONTS))],
    children: [
      {
        path: 'login',
        title: 'titles.signIn',
        canMatch: [signedOutGuard],
        loadComponent: () => import('./login'),
      },
      {
        path: '',
        canMatch: [adminGuard],
        loadComponent: () => import('./admin-shell'),
        children: [
          { path: '', title: 'titles.events', loadComponent: () => import('./dashboard') },
          {
            path: 'events/:id',
            title: 'titles.editEvent',
            loadComponent: () => import('./event-editor'),
            canDeactivate: [(editor: EventEditor) => editor.canLeave()],
          },
          {
            path: 'events/:id/rsvps',
            title: 'titles.replies',
            loadComponent: () => import('./rsvp-list'),
          },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },
] satisfies Routes;
