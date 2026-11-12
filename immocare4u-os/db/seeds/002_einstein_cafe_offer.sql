-- Partner offer (owner, 11.11.2026): 20 % discount at Einstein Kaffee, Aaron-Bernstein-Platz 2,
-- 10117 Berlin, for ImmoCare4U guests. Same for every apartment.
INSERT INTO ic.property_kb_entries (property_id, category, key, language, value_text, visibility, source, validity, verified_at)
SELECT p.property_id, 'LOCAL', 'offer_einstein_cafe', v.lang, v.txt, 'PUBLIC_GUEST', 'Inhaber 11.11.2026', 'VERIFIED', now()
FROM ic.properties p
CROSS JOIN (VALUES
  ('de', 'Partner-Angebot: Im Einstein Kaffee, Aaron-Bernstein-Platz 2, 10117 Berlin (Tacheles-Quartier, Nähe Oranienburger Straße), erhalten Gäste von ImmoCare4U 20 % Rabatt. Einfach an der Kasse sagen, dass man bei ImmoCare4U wohnt, und die Nachricht von uns zeigen.'),
  ('en', 'Partner offer: at Einstein Kaffee, Aaron-Bernstein-Platz 2, 10117 Berlin (Tacheles quarter, near Oranienburger Straße), ImmoCare4U guests get a 20% discount. Just tell the staff at the counter that you are staying with ImmoCare4U and show our message.')
) AS v(lang, txt)
ON CONFLICT (property_id, key, language) DO UPDATE SET value_text = EXCLUDED.value_text, validity = 'VERIFIED', verified_at = now();
