// Erzeugt die optimierten Dateien in assets/dist/ (werden mit eingecheckt,
// damit die Seite auch ohne Build-Schritt hochgeladen werden kann).
// Aufruf: npm install && npm run build
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('assets/dist', { recursive: true });

// 1) 3D-Statue: three.js wird gebündelt, ungenutzte Teile fallen weg
await build({
  entryPoints: ['assets/js/statue.js'], outfile: 'assets/dist/statue.js',
  bundle: true, format: 'esm', minify: true, target: 'es2020', legalComments: 'eof',
});

// 2) Seiten-Skript: Lenis + main.js in einer Datei
const main = await transform(readFileSync('assets/js/main.js', 'utf8'), { minify: true, target: 'es2019' });
const lenis = readFileSync('assets/vendor/lenis/lenis.min.js', 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
writeFileSync('assets/dist/main.js', lenis + '\n' + main.code);

// 3) CSS minifizieren (Pfade zu ../fonts bleiben gültig, da dist/ neben css/ liegt)
const css = await transform(readFileSync('assets/css/style.css', 'utf8'), { loader: 'css', minify: true });
writeFileSync('assets/dist/style.css', css.code);

// 4) CSS direkt in index.html einbetten (spart eine Anfrage vor dem ersten Bild).
//    Schriftpfade relativ zu index.html umschreiben.
const inline = css.code.replace(/url\(\.\.\/fonts\//g, 'url(assets/fonts/');
const html = readFileSync('index.html', 'utf8');
const re = /(<!-- CSS:START[^>]*-->)[\s\S]*?(<!-- CSS:END -->)/;
if (!re.test(html)) throw new Error('CSS-Marker in index.html fehlen');
writeFileSync('index.html', html.replace(re, `$1\n  <style>${inline}</style>\n  $2`));

console.log('Build fertig: assets/dist/');
