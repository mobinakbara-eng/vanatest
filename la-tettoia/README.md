# La Tettoia – Website

Static website for **La Tettoia – Ristorante Pizzeria**, Waldstraße 55, 10551 Berlin-Moabit.
No build step: open `index.html`, or upload the folder to any web host (GitHub Pages, Netlify, Vercel, …).

## Contents
- `index.html` – one-page site: hero with live open/closed status, story, house specialties, full menu (food and drinks), gallery, reviews, events, reservation form, opening hours, map
- `js/menu-data.js` – the full menu from the official menu PDF. **Prices and dishes are changed here.**
- `js/main.js` – language switch (DE/EN), menu filters and search, reservation form, slider, map
- `css/style.css` – design
- `impressum.html`, `datenschutz.html` – legal pages (**the fields marked [ ] must be filled in**)

## Settings (`js/main.js` → `CONFIG`)
- `hours` – opening hours per weekday (currently Tue–Sun 16:00–24:00, Monday closed)
- `slots` – bookable times (16:00–22:00, every 30 min)
- `email` / `whatsapp` – where reservation requests are sent

## How reservations work (floor plan)
1. The guest picks a date, number of guests and a time; the 2D floor plan shows free and booked tables
2. Tap a free table (tapping a table first shows that table's free times)
3. Enter name, phone and e-mail → confirm

- Tables, seat counts and positions are in `js/booking.js` → `TABLES` (drawn from the owner's sketch)
- A table is blocked for 2 hours per booking (`CONFIG.booking.durationMin`)
- **Demo mode (current):** the occupancy shown is a sample, and new bookings are stored only in the guest's own browser. The guest then sends the request by e-mail/WhatsApp.
- **Live mode:** create a Supabase project, run `supabase/schema.sql`, and set `supabaseUrl` and `supabaseKey` (publishable key) in `CONFIG.booking`. From then on every guest sees real occupancy, and the database itself blocks double bookings.

## Before going live
1. Replace the photos with your own photos of the restaurant (they are currently Unsplash placeholders)
2. Fill in the Impressum and the Datenschutz (privacy) page
3. Check the opening hours, the WhatsApp number and the rating figures
