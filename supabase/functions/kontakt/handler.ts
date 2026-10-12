// HTTP handler for the contact form. All I/O is injected so it can be tested without Supabase.
import { type Anfrage, validate } from "./validate.ts";

export interface Deps {
  /** Exact origins allowed to call the endpoint, e.g. "https://vana-management.de". "*" allows all. */
  allowedOrigins: string[];
  /** Secret salt for hashing IP addresses (rate limit). */
  salt: string;
  /** Returns false when the IP hash exceeded the limit; counts the request otherwise. */
  rateLimit(ipHash: string): Promise<boolean>;
  insertAnfrage(anfrage: Anfrage): Promise<void>;
  /** Optional: e-mail notification. Failures are logged, never shown to the visitor. */
  notify?(anfrage: Anfrage): Promise<void>;
  /** Optional: Cloudflare Turnstile verification. When set, a token is required. */
  verifyTurnstile?(token: string, ip: string | null): Promise<boolean>;
  log?(message: string, detail?: unknown): void;
}

const MAX_BODY_BYTES = 16 * 1024;
const MIN_FILL_MS = 3000;

export function clientIp(req: Request): string | null {
  const h = req.headers;
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null;
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + "|" + ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createHandler(deps: Deps) {
  const log = deps.log ?? ((m: string, d?: unknown) => console.error(m, d ?? ""));

  function cors(origin: string | null): Record<string, string> {
    const allowAll = deps.allowedOrigins.includes("*");
    const allowed = origin && (allowAll || deps.allowedOrigins.includes(origin));
    return {
      ...(allowed ? { "Access-Control-Allow-Origin": allowAll ? "*" : origin } : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
  }

  function json(status: number, body: unknown, origin: string | null): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) },
    });
  }

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const originOk = !origin || deps.allowedOrigins.includes("*") || deps.allowedOrigins.includes(origin);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: originOk ? 204 : 403, headers: cors(origin) });
    }
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);
    if (!originOk) return json(403, { error: "origin_not_allowed" }, origin);
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return json(415, { error: "unsupported_media_type" }, origin);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { error: "too_large" }, origin);

    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed;
    } catch {
      return json(400, { error: "invalid_json" }, origin);
    }

    // Spam traps: filled honeypot or a form sent faster than a person can type.
    // Answer like a success so bots get no signal.
    const elapsed = Number(body.elapsed_ms);
    if ((typeof body.website === "string" && body.website.trim() !== "") || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
      return json(200, { ok: true }, origin);
    }

    const ip = clientIp(req);

    if (deps.verifyTurnstile) {
      const token = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
      let human = false;
      try {
        human = token !== "" && (await deps.verifyTurnstile(token, ip));
      } catch (e) {
        log("turnstile verification failed", e);
      }
      if (!human) return json(403, { error: "captcha_failed" }, origin);
    }

    const result = validate(body);
    if (!result.ok) return json(422, { error: "validation", fields: result.errors }, origin);

    try {
      if (!(await deps.rateLimit(await hashIp(ip ?? "unknown", deps.salt)))) {
        return json(429, { error: "rate_limited" }, origin);
      }
      await deps.insertAnfrage(result.value);
    } catch (e) {
      log("storing the request failed", e);
      return json(500, { error: "server_error" }, origin);
    }

    if (deps.notify) {
      try {
        await deps.notify(result.value);
      } catch (e) {
        log("notification failed", e);
      }
    }

    return json(201, { ok: true }, origin);
  };
}
