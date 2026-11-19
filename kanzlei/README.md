# Kanzlei-Website (Berlin) – Vorlage

Statische, schnelle Website für eine Anwaltskanzlei in Berlin. Kein Framework, keine Cookies, kein Tracking.

## Struktur

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Scroll-Szene mit 3D-Justitia, Rechtsgebiete, Ablauf, Über mich, Kosten, FAQ, Kontakt |
| `impressum.html` | Impressum nach § 5 DDG inkl. berufsrechtlicher Angaben |
| `datenschutz.html` | Datenschutzerklärung (Entwurf) |
| `kontakt.php` | Versand des Kontaktformulars per E-Mail (PHP-Hosting nötig) |
| `assets/css/style.css` | Gestaltung (Farben oben unter `:root`) |
| `assets/js/main.js` | Scroll-Szene, Einblendungen, Formular |
| `assets/js/statue.js` | 3D-Justitia (three.js) |
| `assets/fonts/` | Lokal eingebundene Schrift Poppins (SIL OFL) |
| `assets/logo/` | Logo als SVG (hell/dunkel, Zeichen) |
| `assets/img/` | Hier die Fotos ablegen |

## Fotos einfügen

- `assets/img/portrait.jpg` – Porträt für „Über mich“, Hochformat 4:5 (ca. 1200 × 1500 px)

Solange die Dateien fehlen, wird automatisch ein Platzhalter angezeigt.

## Vor dem Livegang ersetzen

- Name „Max Mustermann“ / „Kanzlei Mustermann“, Adresse, Telefon, E-Mail (Suche nach `Mustermann`, `Musterstraße`, `030 123`)
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
`assets/img/justitia-poster.webp` (Standbild, solange das Modell lädt bzw. ohne WebGL), `assets/vendor/three/` (three.js, lokal).

Stellschrauben: Szenenlänge in `style.css` (`.scene { height: 240vh }`), Drehung in `statue.js` (`p * Math.PI`), Unschärfe in `main.js` (`--blur`),
Bronze-Farbe in `statue.js` (`color: 0x6a4527`), großes Wort in `index.html` (`.bigword`).

**Lizenz des 3D-Modells:** „Lady Justice“ von Kenny Maguire Studio, CC BY 4.0 – die Namensnennung im Footer und Impressum muss bleiben.
Gestaltungsidee nach einer Vorlage aus einem Video; Texte, Logo und Umsetzung sind eigenständig.
