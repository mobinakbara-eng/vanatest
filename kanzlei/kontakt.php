<?php
/**
 * Kontaktformular – einfacher, datensparsamer Mail-Versand.
 * Funktioniert auf jedem Webhosting mit PHP und aktivierter mail()-Funktion
 * (z. B. Strato, IONOS, all-inkl, Hetzner Webhosting).
 *
 * ANPASSEN: Empfängeradresse und Absenderadresse (muss zur eigenen Domain gehören).
 */

const MAIL_TO   = 'kontakt@kanzlei-mustermann.de';
const MAIL_FROM = 'website@kanzlei-mustermann.de';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method']);
}

// Honeypot: Bots füllen dieses unsichtbare Feld aus
if (!empty($_POST['website'])) {
    respond(200, ['ok' => true]);
}

$clean = static fn($v, int $max) => mb_substr(trim(str_replace(["\r", "\0"], '', (string)($v ?? ''))), 0, $max);

$name    = $clean($_POST['name'] ?? '', 120);
$email   = $clean($_POST['email'] ?? '', 200);
$phone   = $clean($_POST['phone'] ?? '', 60);
$area    = $clean($_POST['area'] ?? '', 60);
$reply   = $clean($_POST['reply'] ?? '', 30);
$message = mb_substr(trim((string)($_POST['message'] ?? '')), 0, 5000);
$privacy = !empty($_POST['privacy']);

if (mb_strlen($name) < 2 || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($message) < 10 || !$privacy) {
    respond(422, ['ok' => false, 'error' => 'validation']);
}
// Header-Injection verhindern
if (preg_match('/[\n\r]/', $name . $email)) {
    respond(422, ['ok' => false, 'error' => 'validation']);
}

$subject = 'Neue Anfrage über die Website' . ($area !== '' ? " – $area" : '');
$body = "Neue Anfrage über das Kontaktformular\n"
      . "-------------------------------------\n"
      . "Name:          $name\n"
      . "E-Mail:        $email\n"
      . "Telefon:       " . ($phone !== '' ? $phone : '–') . "\n"
      . "Rechtsgebiet:  " . ($area !== '' ? $area : '–') . "\n"
      . "Rückweg:       " . ($reply !== '' ? $reply : '–') . "\n\n"
      . "Nachricht:\n$message\n";

$headers = [
    'From: Kanzlei Website <' . MAIL_FROM . '>',
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
];

$sent = mail(MAIL_TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));

respond($sent ? 200 : 500, ['ok' => (bool)$sent]);
