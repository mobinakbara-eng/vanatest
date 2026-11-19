# Kanzlei-Website (Berlin) – Vorlage

Statische, schnelle Website für eine Anwaltskanzlei in Berlin. Kein Framework, keine Cookies, kein Tracking.

## Struktur

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Hero, Leitsatz, Rechtsgebiete, Ablauf, Über mich, Kosten, FAQ, Kontakt |
| `impressum.html` | Impressum nach § 5 DDG inkl. berufsrechtlicher Angaben |
| `datenschutz.html` | Datenschutzerklärung (Entwurf) |
| `kontakt.php` | Versand des Kontaktformulars per E-Mail (PHP-Hosting nötig) |
| `assets/css/style.css` | Gestaltung (Farben oben unter `:root`) |
| `assets/js/main.js` | „Roter Faden“-Animation, Einblendungen, Formular |
| `assets/fonts/` | Lokal eingebundene Schriften (Fraunces, Inter – SIL OFL) |
| `assets/img/` | Hier die Fotos ablegen |

## Fotos einfügen

- `assets/img/portrait.jpg` – Hero-Porträt, Hochformat 4:5 (ca. 1200 × 1500 px)
- `assets/img/portrait-2.jpg` – zweites Foto für „Über mich“

Solange die Dateien fehlen, wird automatisch ein Platzhalter angezeigt.

## Vor dem Livegang ersetzen

- Name „Max Mustermann“ / „Kanzlei Mustermann“, Adresse, Telefon, E-Mail (Suche nach `Mustermann`, `Musterstraße`, `030 123`)
- Alle Texte mit `[Platzhalter]` und alle gelb markierten Stellen im Impressum/Datenschutz
- Rechtsgebiete (in `index.html` und im `<select>` des Formulars)
- Sprachen, Werdegang, Öffnungszeiten, Anfahrt, Position des Pins auf der Karte
- `kontakt.php`: `MAIL_TO` und `MAIL_FROM`
- Strukturierte Daten (`application/ld+json`) im `<head>` von `index.html`

## Rechtliche Checkliste (Stand: November 2026)

- Impressum: Kammer (RAK Berlin), Berufsbezeichnung + Verleihungsstaat, berufsrechtliche Regelungen, Berufshaftpflicht mit Geltungsbereich, USt-IdNr.
- **Kein Link zur EU-OS-Plattform** – diese wurde am 20.07.2025 abgeschaltet; der Hinweis nach VSBG (Schlichtungsstelle der Rechtsanwaltschaft) bleibt.
- Keine Google Fonts / Google Maps / Tracking → kein Cookie-Banner nötig. Wer später Analytics o. Ä. einbaut, braucht ein Consent-Banner (§ 25 TDDDG).
- Werbung sachlich halten (§ 43b BRAO). „Fachanwalt für …“ nur verwenden, wenn der Titel verliehen ist; sonst „Tätigkeitsschwerpunkt“.
- Erstberatungsgebühr (§ 34 RVG, max. 190 € zzgl. USt. für Verbraucher) vor Veröffentlichung prüfen.
- Datenschutzerklärung an Hoster und E-Mail-Anbieter anpassen, AV-Vertrag mit dem Hoster abschließen.
- Website nur mit HTTPS betreiben.

Diese Vorlage ersetzt keine rechtliche Prüfung der Pflichtangaben.

## Lokal ansehen

```bash
cd kanzlei
python3 -m http.server 8000
# → http://localhost:8000
```

## Der „rote Faden“

Eine SVG-Linie zieht sich beim Scrollen durch die ganze Seite. Ein §-Zeichen läuft als Marker mit, und an jedem Abschnitt füllt sich ein Knotenpunkt. Am Ende mündet der Faden in den Kanzlei-Pin auf der stilisierten Berlin-Karte. Ankerpunkte werden im HTML über `data-thread` gesetzt:

- `data-thread="start"` / `"end"` – Anfang und Ende
- `data-thread="node"` – Knoten an einer Abschnittsüberschrift
- `data-thread="gap" data-x=".6"` – Schwung in einem Leerraum (x als Anteil der Seitenbreite)
- `data-thread-mobile="skip"` / `"end"` – abweichendes Verhalten auf dem Handy

Mit „Bewegung reduzieren“ im Betriebssystem wird die Linie ohne Animation angezeigt.
