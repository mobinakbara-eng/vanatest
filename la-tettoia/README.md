# La Tettoia website and manager dashboard

Static restaurant site with a Supabase-backed booking request flow and a private manager page. No frontend build step is required. Serve this folder over HTTP(S), for example with `node dev-server.mjs` locally. The manager page is `/manager.html`.

## Guest flow

Guests choose a date, time, party size and table. The database holds each table for two hours and rejects overlapping requests. A new request is **pending** until the manager confirms it. Pending requests block the table so two guests cannot request the same slot. The confirmation screen says clearly that the restaurant must approve it. When the backend is not configured or cannot be reached, the booking controls are disabled and a phone number is shown. There are no fabricated bookings or browser-only reservations.

## Manager flow

One Supabase Auth user can sign in at `manager.html`. The dashboard lists requests and contact details, filters by date/status, confirms or cancels requests, and saves internal notes. It refreshes the list while open. The manager can add, edit and remove food, drinks, wine groups, items and categories, then publish the entire menu. A version check prevents one manager session from silently overwriting another session's menu changes. The database's row-level security rules, not the hidden page or JavaScript, protect guest details and menu writes.

**Guest communication:** Confirmation/cancellation currently requires the manager to contact the guest using the phone or email shown in the dashboard. Automatic transactional email is not configured. Keep the dashboard open during service or check it regularly.

## Set up the restaurant's Supabase project

1. Create/select the restaurant's own Supabase project in the intended EU region. Use the SQL editor to run `supabase/schema.sql` and then `supabase/seed-menu.sql`. The seed preserves an existing published menu. Ensure the `public` schema is exposed to the Data API.
2. In Supabase Auth, create one manager user with the intended email. The manager should set their own password through the Auth workflow; never put it in this repository.
3. In the SQL editor, grant that exact user manager access:

   ```sql
   insert into public.manager_accounts (user_id)
   select id from auth.users where lower(email) = lower('MANAGER_EMAIL_HERE');
   ```

   Confirm that this inserted exactly one row. No signup link is exposed by the website.
4. Put the project's URL and **publishable** API key (`sb_publishable_...`) in `js/config.js`. The publishable key is meant for browsers; the secret/service-role key must never be placed there. Guest requests send the key only as `apikey`. Manager requests add their Auth access token in `Authorization`.
5. Deploy only this `la-tettoia` folder on HTTPS. Configure the deployment's document root so `index.html` and `manager.html` resolve at the same origin. Keep public access off until legal text and real photographs are approved.

## Before opening to guests

- Replace the Unsplash placeholder images with approved photographs of the restaurant.
- Remove the temporary `noindex` meta tag from `index.html` only after publication is approved.
- Have the owner verify the legal operator, tax details, hosting provider, privacy text and retention period in `impressum.html` and `datenschutz.html`. Both pages still contain placeholders and must be reviewed before publication.
- Floor plan (from the owner's sketch): tables 1–4 along the left wall seat 6, tables 5–8 in the small room on the right seat 4, the WC is behind the dividing wall, no terrace. Seat limits live in `js/booking.js` (`TABLES`) and in the `guest_books` policy in `supabase/schema.sql` – keep both in sync.
- **Database already set up before October 2026?** Run `supabase/update-table-seats.sql` once in the SQL editor so the database accepts the new seat counts (otherwise requests for 3–4 guests at tables 5–8 and 5–6 guests at tables 1–3 are rejected).
- Confirm the table positions against the real room, opening hours, contact numbers, dishes, prices, allergens and rating claims with the owner. `js/menu-data.js` is the original fallback/seed source; after setup, the `site_menu` database row is the published source of truth.
- In a connected non-production project, verify: guest request → pending row → manager sees it → manager confirms → guest contacts/confirmation process → occupied slot persists after reload; conflicting requests are rejected; cancellation releases the slot; a manager menu edit appears on the public site after publishing and reload. Also verify a signed-out visitor cannot read `reservations` or write `site_menu`.

## Menu PDF

The website offers the full menu as a download (`speisekarte.pdf` in German, `menu-en.pdf` in English) instead of an on-page menu. Both are generated from `menu-print.html` by `tools/build-menu-pdf.cjs`, using the menu published in the manager dashboard (falling back to `js/menu-data.js`). The GitHub Pages workflow rebuilds them on every deploy; after editing the menu in the dashboard, re-run the **Publish La Tettoia** workflow (Actions → Run workflow) to refresh the PDFs. To build locally: `npm install --no-save playwright@1 && npx playwright install chromium && node la-tettoia/tools/build-menu-pdf.cjs`.

`supabase/build-seed.mjs` regenerates `seed-menu.sql` from the bundled `js/menu-data.js` if the initial menu changes before first deployment. It does not overwrite a menu already published by the manager.
