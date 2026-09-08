import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify, isLosslessNumber } from "lossless-json";
import assert from "node:assert/strict";

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EVM = /\b0x[0-9a-f]{40}\b/gi;
const SOL = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const SECRET = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "privyaccesstoken",
  "apikey",
  "authorization",
  "signature",
  "jwt",
  "password",
  "secret",
  "privatekey",
  "walletkey",
  "caid",
  "clientauthid",
]);
const ID = new Set([
  "id",
  "userid",
  "tradeid",
  "swapid",
  "parentid",
  "commentid",
  "requestid",
  "expecteduserid",
  "lastid",
  "lastswapidv2",
  "lasttradeid",
  "cursor",
  "nextcursor",
  "orderid",
  "handle",
  "userhandle",
  "next",
  "txhash",
  "transactionhash",
]);
const normalizeKey = (k) => k.toLowerCase().replace(/[_-]/g, "");
const ENUM = new Set([
  "type",
  "kind",
  "side",
  "status",
  "chain",
  "provider",
  "source",
  "period",
  "interval",
  "resolution",
  "topictype",
  "eventtype",
]);

/** Only recording rewrites identities. Replay must not make a wrong input match. */
export class Redactor {
  constructor() {
    this.identities = new Map();
    this.secrets = new Set();
    this.counter = 0;
  }
  addSecret(value) {
    if (typeof value === "string" && value) this.secrets.add(value);
  }
  bind(value, alias) {
    this.identities.set(value, alias);
    this.counter++;
  }
  secretText(text) {
    for (const secret of this.secrets) {
      for (const representation of [
        secret,
        JSON.stringify(secret).slice(1, -1),
        encodeURIComponent(secret),
      ]) {
        if (representation) text = text.split(representation).join("<secret>");
      }
    }
    return text.replace(JWT, "<secret>");
  }
  alias(value) {
    if (this.identities.has(value)) return this.identities.get(value);
    const n = ++this.counter;
    let replacement;
    if (/^[a-f0-9-]{36}$/i.test(value))
      replacement = `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
    else if (/^0x[0-9a-f]{40}$/i.test(value)) replacement = `0x${n.toString(16).padStart(40, "0")}`;
    else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
      const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      let x = BigInt(n),
        encoded = "";
      while (x) {
        encoded = alphabet[Number(x % 58n)] + encoded;
        x /= 58n;
      }
      replacement = "1".repeat(32 - Math.ceil(n.toString(16).length / 2)) + encoded;
    } else replacement = `fixture-id-${n}`;
    this.identities.set(value, replacement);
    return replacement;
  }
  identifiers(text) {
    return text
      .replace(UUID, (v) => this.alias(v))
      .replace(EVM, (v) => this.alias(v))
      .replace(SOL, (v) => this.alias(v));
  }
  input(value, key = "") {
    if (value === null || isLosslessNumber(value)) return value;
    if (Array.isArray(value)) return value.map((v) => this.input(v, key));
    if (typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [this.identifiers(k), this.input(v, k)]),
      );
    if (typeof value !== "string") return value;
    if (SECRET.has(normalizeKey(key))) return "<secret>";
    if (ID.has(normalizeKey(key))) return this.alias(value);
    return this.identifiers(this.secretText(value));
  }
  body(value, key = "") {
    if (value === null || isLosslessNumber(value)) return value;
    if (Array.isArray(value)) return value.map((v) => this.body(v, key));
    if (typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [this.identifiers(k), this.body(v, k)]),
      );
    if (typeof value !== "string") return value;
    const name = normalizeKey(key);
    if (SECRET.has(name) && typeof value === "string") return "<secret>";
    if (ID.has(name)) return this.alias(value);
    const safe = this.secretText(value);
    if (safe !== value) return "<secret>";
    if (!value || NUMBER.test(value) || /^\d{4}-\d\d-\d\d(?:[T ][\d:.+Z-]+)?$/.test(value))
      return value;
    if (/^https?:\/\//i.test(value)) return "https://fixture.invalid/redacted";
    // Do not retain a biography/thesis merely because it contains an address.
    const identifier = "[1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40}|[0-9a-fA-F-]{36}";
    if (
      new RegExp(`^(?:${identifier})$`).test(value) ||
      new RegExp(`^(?:${identifier}):\\d+$`).test(value) ||
      new RegExp(`^\\d+:(?:${identifier})$`).test(value)
    )
      return this.identifiers(value);
    if (name === "topicid" && /^\d+(?:,\d+)*$/.test(value)) return value;
    if (ENUM.has(name) && /^[A-Za-z][A-Za-z0-9_.:/-]{0,63}$/.test(value)) return value;
    return "[redacted text]";
  }
  json(text, { inputs = false } = {}) {
    if (!text) return "";
    const value = parse(text, undefined, {
      onDuplicateKey: () => {
        throw new Error("Duplicate JSON key");
      },
    });
    return stringify(inputs ? this.input(value) : this.body(value));
  }
  assertSafe(text) {
    assert.ok(!new RegExp(JWT.source).test(text), "Credential-like JWT in fixture");
    assert.ok(!/-----BEGIN .*PRIVATE KEY-----/.test(text), "Private key in fixture");
    for (const secret of this.secrets) {
      assert.ok(
        !text.includes(secret) && !text.includes(encodeURIComponent(secret)),
        "Credential in fixture",
      );
    }
  }
}

export function providerPolicy(service) {
  assert.ok(["fomo", "gmgn"].includes(service), "Unknown cassette service");
  const origin = service === "fomo" ? "https://prod-api.fomo.family" : "https://openapi.gmgn.ai";
  return {
    service,
    origin,
    allowRecord(method, path) {
      if (service === "gmgn" && method === "POST")
        return [
          "/v1/user/wallet_profits",
          "/v1/trenches",
          "/v1/market/token_signal",
          "/v1/market/hot_searches",
        ].includes(path);
      if (method !== "GET") return false;
      return service === "fomo"
        ? path === "/v2/users/current" ||
            path === "/v2/leaderboard" ||
            /^\/v2\/users\/userHandle\/[^/]+$/.test(path) ||
            /^\/v2\/leaderboard\/(24h|7d|30d)$/.test(path) ||
            /^\/v2\/users\/[^/]+\/swaps$/.test(path) ||
            ["/feed/tradingActivity", "/feed/token", "/hodlers/top"].includes(path)
        : [
            "/v1/token/info",
            "/v1/token/security",
            "/v1/token/pool_info",
            "/v1/market/token_top_holders",
            "/v1/market/token_top_traders",
            "/v1/market/token_kline",
            "/v1/user/wallet_holdings",
            "/v1/user/wallet_activity",
            "/v1/user/wallet_stats",
            "/v1/user/wallet_token_balance",
            "/v1/market/rank",
            "/v1/market/search",
            "/v1/user/info",
            "/v1/trade/follow_wallet",
            "/v1/user/follow_tokens",
            "/v1/user/follow_token_groups",
            "/v1/user/kol",
            "/v1/user/smartmoney",
            "/v1/user/created_tokens",
            "/v1/trade/quote",
            "/v1/trade/query_order",
            "/v1/trade/gas_price",
            "/v1/trade/strategy/orders",
            "/v1/cooking/statistics",
          ].includes(path);
    },
    request(url, init, redactor, recording) {
      const u = new URL(url);
      assert.equal(u.origin, origin, "Wrong request origin");
      assert.ok(!u.username && !u.password, "URL credentials forbidden");
      const method = init.method ?? "GET";
      const headers = new Headers(init.headers);
      const auth = headers.get(service === "fomo" ? "authorization" : "x-apikey");
      assert.ok(auth && auth.trim(), "Missing authentication header");
      if (service === "fomo") assert.match(auth, /^Bearer \S+$/, "Invalid bearer shape");
      redactor.addSecret(service === "fomo" ? auth.slice(7) : auth);
      if (headers.has("x-signature")) redactor.addSecret(headers.get("x-signature"));
      if (service === "gmgn") {
        assert.match(u.searchParams.get("timestamp") ?? "", /^\d+$/, "Missing timestamp");
        assert.match(
          u.searchParams.get("client_id") ?? "",
          /^[0-9a-f-]{36}$/i,
          "Missing client_id",
        );
      }
      const query = [...u.searchParams].map(([k, v]) => {
        if (service === "gmgn" && k === "timestamp") return [k, "<timestamp>"];
        if (service === "gmgn" && k === "client_id") return [k, "<request-id>"];
        if (SECRET.has(normalizeKey(k))) return [k, "<secret>"];
        if (!recording) return [k, v];
        return [k, k === "tokens" ? redactor.json(v, { inputs: true }) : redactor.input(v, k)];
      });
      const body = init.body == null ? "" : String(init.body);
      return {
        method,
        origin: `https://${service}.fixture.invalid`,
        path:
          recording && service === "fomo" && u.pathname.startsWith("/v2/users/userHandle/")
            ? `/v2/users/userHandle/${encodeURIComponent(redactor.alias(decodeURIComponent(u.pathname.split("/").at(-1))))}`
            : recording
              ? redactor.identifiers(u.pathname)
              : u.pathname,
        query,
        headers: {
          authentication: "<present>",
          ...(headers.has("content-type") ? { "content-type": headers.get("content-type") } : {}),
          ...(headers.has("x-supported-chains")
            ? { "x-supported-chains": headers.get("x-supported-chains") }
            : {}),
          ...(headers.has("x-signature") ? { "x-signature": "<present>" } : {}),
        },
        body: recording && body ? redactor.json(body, { inputs: true }) : body,
      };
    },
  };
}

async function readBody(response, signal) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new Error("Recording aborted");
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new Error("Recording aborted");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) {
        cancel();
        throw new Error("Cassette response too large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
const headersOf = (response) =>
  Object.fromEntries(
    ["content-type", "retry-after", "x-ratelimit-reset"]
      .filter((k) => response.headers.has(k))
      .map((k) => [k, response.headers.get(k)]),
  );
const asResponse = (r) => new Response(r.body || null, { status: r.status, headers: r.headers });

export class Cassette {
  constructor({ file, policy, mode = "replay", provenance, inputs = {} }) {
    assert.ok(["record", "replay"].includes(mode), "Unknown cassette mode");
    this.file = file;
    this.policy = policy;
    this.mode = mode;
    this.redactor = new Redactor();
    this.inputs = inputs;
    this.used = new Set();
    this.committed = false;
    this.failed = false;
    if (mode === "replay") {
      const text = readFileSync(file, "utf8");
      assert.ok(Buffer.byteLength(text) <= 8 * 1024 * 1024, "Cassette too large");
      this.data = JSON.parse(text);
      assert.equal(this.data.format, "sdk-http-cassette/v1");
      assert.equal(this.data.service, policy.service);
      assert.ok(["live", "synthetic"].includes(this.data.provenance?.kind));
      assert.ok(Array.isArray(this.data.exchanges));
    } else {
      assert.ok(["live", "synthetic"].includes(provenance?.kind), "Explicit provenance required");
      this.data = {
        format: "sdk-http-cassette/v1",
        service: policy.service,
        provenance,
        capturedAt: new Date().toISOString(),
        inputs: {},
        exchanges: [],
      };
    }
  }
  get fixtureInputs() {
    return this.data.inputs;
  }
  async exchange(url, init, send) {
    let stage = "request";
    let status;
    try {
      const request = this.policy.request(url, init, this.redactor, this.mode === "record");
      if (this.mode === "replay") {
        const key = JSON.stringify(request);
        const at = this.data.exchanges.findIndex(
          (row, i) => !this.used.has(i) && JSON.stringify(row.request) === key,
        );
        assert.ok(
          at >= 0,
          "Unmatched or exhausted cassette request; network fallback is forbidden",
        );
        this.used.add(at);
        return asResponse(this.data.exchanges[at].response);
      }
      assert.ok(
        this.policy.allowRecord(request.method, new URL(url).pathname),
        "Recording this operation is forbidden",
      );
      assert.ok(!this.committed, "Cassette already committed");
      // Reserve invocation order before awaiting a possibly concurrent transport.
      const row = { request, response: null };
      this.data.exchanges.push(row);
      stage = "transport";
      const response = await send();
      status = response.status;
      stage = "body";
      const original = await readBody(response, init.signal);
      stage = "scrub";
      let body;
      try {
        body = this.redactor.json(original);
      } catch (error) {
        if (response.status < 400) throw error;
        // Preserve HTTP precedence for HTML/plain-text failures without storing
        // the original error page or reflecting credentials.
        body = "[redacted non-JSON HTTP error]";
      }
      const stored = {
        status: response.status,
        headers: headersOf(response),
        body,
      };
      row.response = stored;
      // Caller sees the unsanitized original, not the recording copy.
      return new Response(original || null, { status: response.status, headers: response.headers });
    } catch (error) {
      this.failed = true;
      this.failure = { stage, ...(status === undefined ? {} : { httpStatus: status }) };
      throw error;
    }
  }
  fetch(next) {
    return (url, init = {}) =>
      this.exchange(String(url), init, () => {
        assert.equal(this.mode, "record");
        assert.equal(typeof next, "function");
        return next(url, init);
      });
  }
  transport(next) {
    return {
      send: (request) =>
        this.exchange(request.url, request, () => {
          assert.equal(this.mode, "record");
          assert.ok(next);
          return next.send(request);
        }),
    };
  }
  assertConsumed() {
    if (this.mode === "replay")
      assert.equal(this.used.size, this.data.exchanges.length, "Unused cassette interactions");
  }
  commit() {
    assert.equal(this.mode, "record");
    assert.ok(!this.failed, "Failed recordings cannot commit");
    assert.ok(!this.committed && this.data.exchanges.length, "Empty/already committed recording");
    assert.ok(
      this.data.exchanges.every((row) => row.response !== null),
      "Recording still in flight",
    );
    this.data.inputs = this.redactor.input(this.inputs);
    const text = JSON.stringify(this.data, null, 2) + "\n";
    this.redactor.assertSafe(text);
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp-${randomUUID()}`;
    try {
      writeFileSync(temporary, text, { flag: "wx", mode: 0o600 });
      renameSync(temporary, this.file);
      this.committed = true;
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {}
      throw error;
    }
  }
}
