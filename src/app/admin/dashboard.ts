import { Component } from '@angular/core';

/** Placeholder until step 4. */
@Component({
  selector: 'app-dashboard',
  host: { class: 'admin block min-h-dvh px-4 py-8' },
  template: `
    <main class="mx-auto max-w-5xl">
      <h1 class="text-xl font-semibold">Events</h1>
      <p class="mt-2 text-sm text-muted">The event list arrives in step 4.</p>
    </main>
  `,
})
export default class Dashboard {}
