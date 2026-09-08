import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
test("committed fixtures contain no credential patterns or real address/UUID identities", () => {
  for (const file of files(fileURLToPath(new URL("./fixtures/", import.meta.url)))) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text), "JWT in fixture");
    assert.ok(!/-----BEGIN .*PRIVATE KEY-----/.test(text), "Private key in fixture");
    assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text), "Email in fixture");
    for (const [value] of text.matchAll(/\b0x[0-9a-f]{40,64}\b/gi))
      assert.match(value, /^0x0{32}[0-9a-f]{8}$/, "Non-fixture EVM identity");
    for (const [value] of text.matchAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ))
      assert.match(value, /^00000000-0000-4000-8000-[0-9a-f]{12}$/, "Non-fixture UUID");
    for (const [value] of text.matchAll(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g))
      assert.match(value, /^1{28,}/, "Non-fixture base58 identity");
  }
});
