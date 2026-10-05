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

## How reservations work
The form checks the input (Monday closed, no past dates, max. 12 guests) and builds a finished message.
The guest sends it by **e-mail** or **WhatsApp**, and the restaurant confirms personally.
For automatic booking you can later connect a service (e.g. OpenTable, Quandoo, Formspree).

## Before going live
1. Replace the photos with your own photos of the restaurant (they are currently Unsplash placeholders)
2. Fill in the Impressum and the Datenschutz (privacy) page
3. Check the opening hours, the WhatsApp number and the rating figures
