# RSVP

A small personal RSVP site. Each event gets its own themed page at `/<slug>` where guests reply Yes, Maybe or No without an account; one or more admins manage events and replies at `/admin`.

It is a static Angular app on GitHub Pages talking to one Supabase project. There is no server and no secret key anywhere.

**Backend and frontend are separate.** All data logic lives in the database as named functions (the API, in `supabase/migrations`). The app calls them as endpoints (`/rest/v1/rpc/<name>`) through the services in `src/app/api` and holds no queries of its own. Guests can call two functions; everything else requires a signed-in admin, checked inside each function. Nobody has direct table access.

- Architecture and decisions: [docs/architecture.md](docs/architecture.md)
- Visual design (Claude Design export): [docs/design/](docs/design)

## Stack

Angular (standalone components, signals, zoneless) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage) · GitHub Pages via GitHub Actions · Vitest

## Project layout

```text
src/app/
  app.ts + app.html      root component (router outlet)
  app.routes.ts          / (landing), /admin (lazy), /:slug (lazy), anything else → "not available"
  i18n.ts                languages, translation loading, title strategy
  theme.ts               event theme model, presets, validation, CSS variables, contrast
  api/                   the only code that talks to Supabase (see "API")
    public-api.ts        guest endpoints: get an event, send a reply, image URLs
    admin-api.ts         admin endpoints: events, replies, image upload and removal
    auth-api.ts          sign in/out, session, admin check
    models.ts            data shapes and ApiError, used by the rest of the app
    supabase.ts          the client and response handling (internal)
    database.types.ts    generated from the live schema (npm run db:types)
  home/                  landing page: guests paste their link or code, hosts go to sign in
  not-found/  logo/  language-switch/
  guest/
    rsvp-page/           the public page: loads the event, saved reply, submit, states
    invite/              themed layout and details (also the admin's live preview)
    rsvp-form/  rsvp-confirmation/
    calendar.ts          time zones, date formatting, Google/Outlook/.ics
  admin/
    admin-shell/  login/  dashboard/  event-editor/  look-editor/  event-preview/  rsvp-list/
    admin.routes.ts  auth.ts  ui.ts  csv.ts
```

Each component has its own folder with `<name>.ts` (logic) and `<name>.html` (template), plus `<name>.spec.ts` when it has tests.

```text
src/styles.css           Tailwind entry, event theme tokens, admin UI classes
supabase/
  migrations/            schema, grants, RLS, the API functions, storage bucket and policies
  seed.sql               two demo events (birthday, wedding) with sample replies
  tests/security_checks.sql
scripts/write-env.mjs    writes src/environments/environment.ts from .env or CI variables
scripts/check-api-boundary.mjs  fails the build if anything outside src/app/api uses Supabase
.github/workflows/
  deploy-prod.yml        main → build → GitHub Pages
  keep-alive.yml         twice-weekly ping so the free Supabase project doesn't pause
```

## Local development

Requires Node 22+.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` in the project root (it is gitignored) with the project URL and the **publishable** key from Supabase → Project Settings → API Keys:

   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Start the dev server and open http://localhost:4200/maya-6 or http://localhost:4200/admin:

   ```bash
   npm start
   ```

`npm start` and `npm run build` run `scripts/write-env.mjs` first, which writes the gitignored `src/environments/environment.ts`.

| Script             | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `npm start`        | Dev server on port 4200                                             |
| `npm run build`    | Production build into `dist/rsvp/browser` (base href `/rsvp/`)      |
| `npm test`         | Unit tests (theme, calendar and time zones, CSV)                    |
| `npm run db:types` | Regenerates `src/app/api/database.types.ts` from the linked project |

> Never put the service-role or secret key in `.env`, the repo or CI. The app only ever needs the publishable key; row level security does the rest.

## Supabase setup

The project is created with **Automatically expose new tables** off and **Automatic RLS** on. The migrations grant exactly what the app needs.

1. Link the CLI (a dev dependency) to the project:

   ```bash
   npx supabase link --project-ref <project-ref>
   ```

2. Preview, then apply the migrations. Add `--include-seed` on the first push to load the demo events:

   ```bash
   npx supabase db push --dry-run
   ```

   ```bash
   npx supabase db push --include-seed
   ```

3. In the dashboard:
   - **Authentication → Sign In / Providers:** turn off new user sign-ups.
   - **Authentication → Users:** create your admin user, then make it an admin in the SQL editor:

     ```sql
     insert into public.admins (user_id) values ('<user-uuid>');
     ```

   - **Authentication → URL Configuration:** set the Site URL to `https://<github-user>.github.io/rsvp/`.
   - **Authentication → Passwords:** turn on leaked password protection if your plan includes it.

4. Verify. Paste [supabase/tests/security_checks.sql](supabase/tests/security_checks.sql) into the SQL editor and run it; it works inside a rolled-back transaction and ends with `PASS: all security checks passed`. Then run **Advisors → Security Advisor**. "Security definer function executable" warnings are expected for the API functions, because they are the API: `get_public_event` and `submit_rsvp` (callable by `anon` and `authenticated`) and the `admin_*` functions (callable by `authenticated`, and refusing anyone who isn't an admin).

### API

Every endpoint is a database function, called as `POST /rest/v1/rpc/<name>`. Failures come back as a named error (e.g. `slug_taken`), which the app receives as an `ApiError` code.

| Endpoint                                                               | Who       | Does                                                                   |
| ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `get_public_event(p_slug)`                                             | anyone    | One active event's public fields, or nothing                           |
| `submit_rsvp(p_slug, p_guest_name, p_response, p_notes, p_edit_token)` | anyone    | Creates a reply, or updates it given its edit token; returns the token |
| `current_user_is_admin()`                                              | signed in | Whether the caller is an admin                                         |
| `admin_list_events()`                                                  | admin     | Every event with Yes/Maybe/No counts                                   |
| `admin_get_event(p_id)`                                                | admin     | One event, all fields                                                  |
| `admin_create_event(p_fields)`                                         | admin     | Creates an inactive event with the given fields; picks a free link     |
| `admin_update_event(p_id, p_fields)`                                   | admin     | Saves the given fields; a used link fails with `slug_taken`            |
| `admin_delete_event(p_id)`                                             | admin     | Deletes the event and its replies                                      |
| `admin_list_replies(p_event_id)`                                       | admin     | The event's replies, newest first                                      |
| `admin_delete_reply(p_id)`                                             | admin     | Deletes one reply                                                      |

Images use Supabase's Storage endpoint (bucket `event-images`): public to read, uploads and deletes for admins only.

Nobody has direct table access, signed in or not; RLS stays on as a backstop. Admins are added only in the SQL editor.

To add an endpoint: write the function in a new migration (start admin ones with `perform private.require_admin();`), push it, run `npm run db:types`, then add a method to the matching service in `src/app/api`.

## Deployment

One production site on GitHub Pages:

- `main` deploys automatically through [.github/workflows/deploy-prod.yml](.github/workflows/deploy-prod.yml).
- `development` is for work in progress and does not deploy. Merge into `main` to release.

One-time repo setup:

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions → Variables** (variables, not secrets; both values are public by design):
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `BASE_HREF` (optional) — defaults to `/<repo-name>/`; set it to `/` for a custom domain.

The workflow builds with the base href, copies `index.html` to `404.html` so deep links like `/rsvp/maya-6` survive a refresh, and adds `.nojekyll`.

Live URLs: `https://<github-user>.github.io/rsvp/<slug>` for guests and `https://<github-user>.github.io/rsvp/admin` for admins. The site root, `https://<github-user>.github.io/rsvp/`, is a landing page where a guest can paste their invitation link or code, and hosts can follow a link to sign in.

### Keep-alive ping

Supabase pauses free projects after about a week without activity (check the current policy for your plan). While paused, every guest link shows "We couldn't load this invitation" until the project is restored by hand in the dashboard.

[.github/workflows/keep-alive.yml](.github/workflows/keep-alive.yml) prevents that by calling `get_public_event` on Mondays and Thursdays. It only reads (it asks for a slug that doesn't exist and gets an empty list back), uses the same two repo variables as the deploy workflow, and needs no secrets or repository permissions.

- Scheduled workflows only run from the default branch, so the ping starts once this file is on `main`.
- Run it on demand from **Actions → Keep Supabase awake → Run workflow**; a green run means Supabase answered.
- GitHub disables scheduled workflows in public repos after 60 days without commits. If that happens, GitHub emails you and shows a banner on the workflow; choose **Enable workflow** there.
- If the project ever does pause, restore it in the Supabase dashboard; the ping keeps it awake from then on.
- On a paid Supabase plan projects don't pause, and you can delete the workflow.

## Using it

1. Sign in at `/admin` and choose **+ New event**. New events start inactive.
2. Fill in **Details** (title, link, date, times, time zone, location), **Wording** and **Look**. The preview beside the form shows exactly what guests will see.
3. Switch on **Accepting replies** in the **RSVP** tab and save.
4. **Copy link** from the dashboard and share it.
5. Watch replies come in under **View RSVPs**. Filter, search, delete duplicates, or **Export CSV**.

Notes for guests and hosts:

- An end time earlier than the start time means the event ends the next day.
- A guest's reply is remembered in their browser, so revisiting the link lets them change it instead of adding a duplicate.
- Turning replies off makes the link show "This RSVP page isn't available".
- To remove an event for good, use **Delete event** at the bottom of the editor's **RSVP** tab. It deletes the event, all its replies and its images, after confirmation; the link then shows "not available".
- Uploaded images are resized to at most 1600 px and stored as WebP (JPEG on Safari) in the `event-images` bucket. Images that are no longer used are deleted when you save.

## Changing the database

Add a new migration rather than editing an applied one:

```bash
npx supabase migration new <name>
```

Then preview and apply it with `npx supabase db push --dry-run` and `npx supabase db push`, regenerate types with `npm run db:types`, and run the security checks again.
