import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsedCases, replayParsed } from "./support/parsed-cases.mjs";
for (const entry of parsedCases())
  test(`complete parsed contract ${entry.id}`, async () => {
    const golden = JSON.parse(
      readFileSync(new URL(`./fixtures/parsed/${entry.id}`, import.meta.url), "utf8"),
    );
    assert.equal(
      golden.sourceSha256,
      entry.sha256,
      "Source fixture changed; independently review parsed expectations",
    );
    assert.deepEqual(await replayParsed(entry), golden.parsed);
  });
