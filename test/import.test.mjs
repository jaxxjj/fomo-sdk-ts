import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("all package entrypoints import without CLI, network or credential discovery", () => {
  const urls = [
    "../dist/index.js",
    "../dist/experimental/privy.js",
    "../dist/experimental/stream.js",
  ].map((path) => new URL(path, import.meta.url).href);
  const code = `
    globalThis.fetch=()=>{throw new Error("network on import");};
    const before=globalThis.fetch;
    for(const url of ${JSON.stringify(urls)})await import(url);
    if(globalThis.fetch!==before)throw new Error("global fetch modified");
    console.log("ok");
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code, "--", "--not-a-cli-flag"],
    { encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "ok");
  assert.equal(result.stderr, "");
});
test("live smoke is disabled without an explicit opt-in and token", () => {
  const result = spawnSync(
    process.execPath,
    [new URL("../scripts/smoke.mjs", import.meta.url).pathname],
    { encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH } },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit FOMO_LIVE_READS/);
  assert.equal(result.stdout, "");
});
