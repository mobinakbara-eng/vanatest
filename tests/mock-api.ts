// Runs the real contact handler with an in-memory store, for end-to-end tests.
//   deno run --allow-net tests/mock-api.ts   -> http://localhost:54329/kontakt
// GET /__stored returns what was saved; POST /__reset clears it.
import { createHandler } from "../supabase/functions/kontakt/handler.ts";
import type { Anfrage } from "../supabase/functions/kontakt/validate.ts";

const stored: Anfrage[] = [];
const counts = new Map<string, number>();

const handle = createHandler({
  allowedOrigins: ["http://localhost:4173"],
  salt: "test",
  rateLimit(h) {
    const n = counts.get(h) ?? 0;
    counts.set(h, n + 1);
    return Promise.resolve(n < 5);
  },
  insertAnfrage(a) {
    stored.push(a);
    return Promise.resolve();
  },
  log() {},
});

Deno.serve({ port: 54329, onListen: () => console.log("mock API on http://localhost:54329") }, (req) => {
  const { pathname } = new URL(req.url);
  if (pathname === "/__stored") return Response.json(stored);
  if (pathname === "/__reset") {
    stored.length = 0;
    counts.clear();
    return new Response("ok");
  }
  return handle(req);
});
