// deno test supabase/functions/kontakt/
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createHandler, type Deps, hashIp } from "./handler.ts";
import type { Anfrage } from "./validate.ts";

const ORIGIN = "https://vana-management.com";

function setup(overrides: Partial<Deps> = {}) {
  const stored: Anfrage[] = [];
  const notified: Anfrage[] = [];
  const counts = new Map<string, number>();
  const deps: Deps = {
    allowedOrigins: [ORIGIN],
    salt: "test-salt",
    rateLimit(h) {
      const n = counts.get(h) ?? 0;
      if (n >= 5) return Promise.resolve(false);
      counts.set(h, n + 1);
      return Promise.resolve(true);
    },
    insertAnfrage(a) {
      stored.push(a);
      return Promise.resolve();
    },
    notify(a) {
      notified.push(a);
      return Promise.resolve();
    },
    log() {},
    ...overrides,
  };
  return { handle: createHandler(deps), stored, notified };
}

const valid = {
  name: "  Max   Mustermann ",
  email: "Max@Example.com",
  telefon: "+49 30 123456",
  ort: "10115 Berlin",
  projektart: "Trockenbau",
  nachricht: "Wir möchten eine Trennwand im Wohnzimmer einziehen.",
  datenschutz_akzeptiert: true,
  website: "",
  elapsed_ms: 12000,
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://x.supabase.co/functions/v1/kontakt", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("stores a valid request, normalizes fields and notifies", async () => {
  const { handle, stored, notified } = setup();
  const res = await handle(post(valid));
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(stored.length, 1);
  assertEquals(stored[0].name, "Max Mustermann");
  assertEquals(stored[0].email, "max@example.com");
  assertEquals(notified.length, 1);
  assert(!("website" in stored[0]) && !("elapsed_ms" in stored[0]), "spam fields must not be stored");
});

Deno.test("optional fields become null", async () => {
  const { handle, stored } = setup();
  await handle(post({ ...valid, telefon: "", ort: "   " }));
  assertEquals(stored[0].telefon, null);
  assertEquals(stored[0].ort, null);
});

Deno.test("CORS preflight", async () => {
  const { handle } = setup();
  const ok = await handle(new Request("https://x/kontakt", { method: "OPTIONS", headers: { origin: ORIGIN } }));
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get("access-control-allow-origin"), ORIGIN);
  const bad = await handle(new Request("https://x/kontakt", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assertEquals(bad.status, 403);
  assertEquals(bad.headers.get("access-control-allow-origin"), null);
});

Deno.test("rejects foreign origins, wrong method and content type", async () => {
  const { handle, stored } = setup();
  assertEquals((await handle(post(valid, { origin: "https://evil.example" }))).status, 403);
  assertEquals((await handle(new Request("https://x/kontakt", { method: "GET", headers: { origin: ORIGIN } }))).status, 405);
  assertEquals((await handle(post("name=x", { "content-type": "application/x-www-form-urlencoded" }))).status, 415);
  assertEquals(stored.length, 0);
});

Deno.test("rejects invalid JSON and oversized bodies", async () => {
  const { handle } = setup();
  assertEquals((await handle(post("{nope"))).status, 400);
  assertEquals((await handle(post("[1,2]"))).status, 400);
  assertEquals((await handle(post({ ...valid, nachricht: "x".repeat(20000) }))).status, 413);
});

Deno.test("honeypot and too-fast submissions are dropped silently", async () => {
  const { handle, stored } = setup();
  const r1 = await handle(post({ ...valid, website: "http://spam.example" }));
  const r2 = await handle(post({ ...valid, elapsed_ms: 800 }));
  const r3 = await handle(post({ ...valid, elapsed_ms: undefined }));
  assertEquals([r1.status, r2.status, r3.status], [200, 200, 200]);
  assertEquals(stored.length, 0);
});

Deno.test("returns field errors in German", async () => {
  const { handle, stored } = setup();
  const res = await handle(
    post({
      ...valid,
      name: "A",
      email: "nope",
      projektart: "Dach",
      nachricht: "kurz",
      datenschutz_akzeptiert: false,
      telefon: "abc",
    }),
  );
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(Object.keys(body.fields).sort(), [
    "datenschutz_akzeptiert",
    "email",
    "nachricht",
    "name",
    "projektart",
    "telefon",
  ]);
  assert(body.fields.email.includes("E-Mail"));
  assertEquals(stored.length, 0);
});

Deno.test("rate limit: sixth request from the same IP gets 429", async () => {
  const { handle, stored } = setup();
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await handle(post(valid))).status);
  assertEquals(statuses, [201, 201, 201, 201, 201, 429]);
  assertEquals(stored.length, 5);
  assertEquals((await handle(post(valid, { "x-forwarded-for": "198.51.100.1" }))).status, 201);
});

Deno.test("database error returns 500 without leaking details", async () => {
  const { handle } = setup({ insertAnfrage: () => Promise.reject(new Error("connection refused at 10.0.0.1")) });
  const res = await handle(post(valid));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
});

Deno.test("notification failure does not fail the request", async () => {
  const { handle, stored } = setup({ notify: () => Promise.reject(new Error("smtp down")) });
  assertEquals((await handle(post(valid))).status, 201);
  assertEquals(stored.length, 1);
});

Deno.test("turnstile: required when configured", async () => {
  const { handle, stored } = setup({ verifyTurnstile: (t) => Promise.resolve(t === "good") });
  assertEquals((await handle(post(valid))).status, 403);
  assertEquals((await handle(post({ ...valid, turnstile_token: "bad" }))).status, 403);
  assertEquals((await handle(post({ ...valid, turnstile_token: "good" }))).status, 201);
  assertEquals(stored.length, 1);
});

Deno.test("IP hash is salted and stable", async () => {
  assertEquals(await hashIp("1.2.3.4", "a"), await hashIp("1.2.3.4", "a"));
  assert((await hashIp("1.2.3.4", "a")) !== (await hashIp("1.2.3.4", "b")));
});
