# Kanzlei-Website (Berlin) – Vorlage

Statische, schnelle Website für eine Anwaltskanzlei in Berlin. Kein Framework, keine Cookies, kein Tracking.

## Struktur

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Scroll-Szene mit 3D-Justitia, Rechtsgebiete, Ablauf, Über mich, Kosten, FAQ, Kontakt |
| `impressum.html` | Impressum nach § 5 DDG inkl. berufsrechtlicher Angaben |
| `datenschutz.html` | Datenschutzerklärung (Entwurf) |
| `kontakt.php` | Versand des Kontaktformulars per E-Mail (PHP-Hosting nötig) |
| `assets/css/style.css` | Gestaltung (Farben oben unter `:root`) – Quelle, wird per Build eingebettet |
| `assets/dist/` | Erzeugte, minifizierte Dateien (`npm run build`) |
| `.htaccess` | Komprimierung, Cache, HTTPS (Apache-Hosting) |
| `assets/js/main.js` | Scroll-Szene, Einblendungen, Formular |
| `assets/js/statue.js` | 3D-Justitia (three.js) |
| `assets/fonts/` | Lokal eingebundene Schrift Poppins (SIL OFL) |
| `assets/logo/` | Logo (quer/gestapelt, hell/dunkel), Justitia-Zeichen, Favicon – Text als Pfade, Justitia aus dem 3D-Modell abgeleitet |
| `assets/img/` | Hier die Fotos ablegen |

## Fotos einfügen

- `assets/img/portrait.jpg` – Porträt für „Über mich“, Hochformat 4:5 (ca. 1200 × 1500 px)

Solange die Dateien fehlen, wird automatisch ein Platzhalter angezeigt.

## Vor dem Livegang ersetzen

- Adresse, Telefon, E-Mail – die E-Mail `kontakt@ra-erkan.example` ist ein **Platzhalter** (Suche nach `ra-erkan.example`, `Musterstraße`, `030 123`), auch in `kontakt.php`
- Alle Texte mit `[Platzhalter]` und alle gelb markierten Stellen im Impressum/Datenschutz
- Rechtsgebiete Strafrecht und Verkehrsrecht (Texte in `index.html`), Notfallnummer im Kontaktbereich
- Sprachen, Werdegang, Öffnungszeiten, Anfahrt, Position des Pins auf der Karte
- `kontakt.php`: `MAIL_TO` und `MAIL_FROM`
- Strukturierte Daten (`application/ld+json`) im `<head>` von `index.html`

## Rechtliche Checkliste (Stand: November 2026)

- Impressum: Kammer (RAK Berlin), Berufsbezeichnung + Verleihungsstaat, berufsrechtliche Regelungen, Berufshaftpflicht mit Geltungsbereich, USt-IdNr.
- **Kein Link zur EU-OS-Plattform** – diese wurde am 20.07.2025 abgeschaltet; der Hinweis nach VSBG (Schlichtungsstelle der Rechtsanwaltschaft) bleibt.
- Keine Google Fonts / Google Maps / Tracking → kein Cookie-Banner nötig. Wer später Analytics o. Ä. einbaut, braucht ein Consent-Banner (§ 25 TDDDG).
- Werbung sachlich halten (§ 43b BRAO). Die „Siegel“ im Hero nur mit Aussagen füllen, die stimmen – keine Auszeichnungen vortäuschen. „Fachanwalt für Strafrecht/Verkehrsrecht“ nur verwenden, wenn der Titel verliehen ist; sonst „Tätigkeitsschwerpunkt“.
- Erstberatungsgebühr (§ 34 RVG, max. 190 € zzgl. USt. für Verbraucher) vor Veröffentlichung prüfen.
- Datenschutzerklärung an Hoster und E-Mail-Anbieter anpassen, AV-Vertrag mit dem Hoster abschließen.
- Website nur mit HTTPS betreiben.

Diese Vorlage ersetzt keine rechtliche Prüfung der Pflichtangaben.

## Geschwindigkeit

Lighthouse (lokal, Mobil): **97/100**, Desktop **100/100** (vorher 17). Maßnahmen:

- 3D-Modell vereinfacht und mit Meshopt komprimiert: 4 MB → 1,1 MB (Handy: 0,56 MB).
- three.js und die 3D-Szene laden **erst bei der ersten Interaktion** (Scrollen/Tippen) oder nach 3,5 s; bis dahin zeigt ein identisches Standbild die Statue. Bei Datensparmodus/2G bleibt es beim Standbild.
- Gerendert wird nur, solange sich etwas bewegt; die Scroll-Schleife (Lenis) schläft, wenn nicht gescrollt wird.
- CSS ist in `index.html` eingebettet, Schriften werden vorgeladen, Ersatzschrift mit angepassten Maßen → kein Springen (CLS 0).
- Statue-Standbild wird per `transform` positioniert (kein Layout-Shift), fürs Handy in 540 px.
- `.htaccess`: Brotli/gzip (auch für `.glb`), Browser-Cache, HTTPS-Weiterleitung.

### Nach Änderungen an CSS/JS

```bash
cd kanzlei
npm install      # einmalig
npm run build    # erzeugt assets/dist/ und bettet das CSS in index.html ein
```

Bearbeitet werden nur `assets/css/style.css` und `assets/js/*.js`; `assets/dist/` und der `<style>`-Block in `index.html` werden erzeugt.

## Lokal ansehen

```bash
cd kanzlei
python3 -m http.server 8000
# → http://localhost:8000
```

## Die Scroll-Szene mit der Justitia

Oben auf der Startseite ist eine „gepinnte“ Szene (`.scene`, 240 % Bildschirmhöhe). Beim Scrollen:

1. Headline, Seitentext und Siegel blenden nach oben aus.
2. Die Bronze-Justitia (echtes 3D-Modell, three.js) wächst, wandert nach oben und **dreht sich eine halbe Umdrehung** weich mit dem Scrollen.
3. Hinter ihr erscheint groß das Wort „ANWALT“, zwei feine Linien zeichnen sich.
4. Der Absatz darunter färbt sich Wort für Wort ein.
5. Danach bleibt die Statue **unscharf im Hintergrund** der ganzen Seite stehen (feste Ebene `.statue-layer`).

Die ganze Seite scrollt weich mit Trägheit (Lenis, lokal in `assets/vendor/lenis/`); bei „Bewegung reduzieren“ ist das aus.

Dateien: `assets/js/main.js` (Zeitachse, Layout), `assets/js/statue.js` (3D), `assets/models/lady-justice.glb` (Modell),
`assets/models/lady-justice-mobile.glb` (Handy), `assets/img/justitia-poster*.webp` (Standbild), three.js wird per `npm run build` gebündelt.

Stellschrauben: Szenenlänge in `style.css` (`.scene { height: 240vh }`), Drehung in `statue.js` (`p * Math.PI`), Unschärfe in `main.js` (`--blur`),
Bronze-Farbe in `statue.js` (`color: 0x6a4527`), großes Wort in `index.html` (`.bigword`).

**Lizenz des 3D-Modells:** „Lady Justice“ von Kenny Maguire Studio, CC BY 4.0 – die Namensnennung im Footer und Impressum muss bleiben.
Gestaltungsidee nach einer Vorlage aus einem Video; Texte, Logo und Umsetzung sind eigenständig.
