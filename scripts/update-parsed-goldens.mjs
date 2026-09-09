import { mkdirSync, writeFileSync } from "node:fs";
import { parsedCases, replayParsed } from "../test/support/parsed-cases.mjs";
if (!process.argv.includes("--update"))
  throw new Error("Explicit --update required; review every resulting diff");
const directory = new URL("../test/fixtures/parsed/", import.meta.url);
mkdirSync(directory, { recursive: true });
for (const entry of parsedCases()) {
  const data = await replayParsed(entry);
  writeFileSync(
    new URL(entry.id, directory),
    JSON.stringify({ sourceSha256: entry.sha256, parsed: data }, null, 2) + "\n",
  );
}
console.log("Updated offline parsed goldens. These are expectations, not new live captures.");
