import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const consumer = mkdtempSync(join(tmpdir(), "fomo-sdk-consumer-"));
const [packed] = JSON.parse(
  execFileSync("npm", ["pack", "--json", "--pack-destination", consumer], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  }),
);
assert.equal(packed.name, manifest.name);
assert.equal(packed.version, manifest.version);
for (const { path } of packed.files) {
  assert.ok(
    /^(dist\/|package\.json$|LICENSE$|README\.md$|CHANGELOG\.md$|PROTOCOL\.md$|SECURITY\.md$)/.test(
      path,
    ),
    path,
  );
}
const archive = join(consumer, packed.filename);
execFileSync(
  "npm",
  ["install", "--prefix", consumer, "--ignore-scripts", "--no-audit", "--no-fund", archive],
  { encoding: "utf8", timeout: 120000 },
);
const moduleName = JSON.stringify(manifest.name);
const code = `
import {FomoClient,StaticSession,RefreshableSession,FomoError} from ${moduleName};
import {createPrivyRefresher} from ${JSON.stringify(manifest.name + "/experimental/privy")};
import {FomoStreamClient} from ${JSON.stringify(manifest.name + "/experimental/stream")};
const client=new FomoClient({session:new StaticSession({accessToken:"synthetic"})});
if(typeof client.swaps.pages!=="function"||typeof client.tokens.feed!=="function")throw new Error("missing export");
if(client.swap!==undefined)throw new Error("unexpected execution API");
void RefreshableSession; void FomoError; void createPrivyRefresher; void FomoStreamClient;
console.log("consumer import passed");
`;
assert.equal(
  execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: consumer,
    encoding: "utf8",
    timeout: 15000,
  }).trim(),
  "consumer import passed",
);
writeFileSync(
  join(consumer, "consumer.mts"),
  `
import {FomoClient,StaticSession,type DecimalString,type TokenRef,type Activity} from ${moduleName};
import {FomoStreamClient} from ${JSON.stringify(manifest.name + "/experimental/stream")};
const client=new FomoClient({session:new StaticSession({accessToken:"synthetic"})});
const token:TokenRef={networkId:56,address:"mint"};
const unattributed:Activity={id:"event",userId:null,type:"swap_buy",kind:"buy",createdAt:"2026-09-08T00:00:00Z"};
const actor:string|null=unattributed.userId;
// @ts-expect-error callers must handle unattributed activity explicitly.
const requiredActor:string=unattributed.userId;
void actor; void requiredActor;
// @ts-expect-error connection configuration cannot silently override a supplied connection.
const ambiguous=new FomoClient({connection:client.connection,session:new StaticSession({accessToken:"other"})});
void ambiguous;
async function example(){
  const result=await client.tokens.feed({token});
  const amount:DecimalString|null|undefined=result.data[0]?.usdAmount;
  // @ts-expect-error normalized financial values are not IEEE754 numbers.
  const incorrect:number=result.data[0]?.usdAmount;
  // @ts-expect-error no trading method.
  await client.swap({});
  // @ts-expect-error unknown leaderboard window.
  await client.leaderboards.list({window:"typo"});
  void amount; void incorrect;
}
void example; void new FomoStreamClient(client);
`,
);
execFileSync(
  join(root, "node_modules/.bin/tsc"),
  [
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--lib",
    "ES2022,DOM",
    "--types",
    "node",
    "--typeRoots",
    join(root, "node_modules/@types"),
    join(consumer, "consumer.mts"),
  ],
  { cwd: consumer, encoding: "utf8", timeout: 60000 },
);
console.log("Exact tarball import and public TypeScript contracts passed.");
if (process.argv.includes("--artifact")) {
  const dir = join(root, "artifacts");
  mkdirSync(dir, { recursive: true });
  copyFileSync(archive, join(dir, packed.filename));
  writeFileSync(
    join(dir, `${packed.filename}.sha256`),
    `${createHash("sha256").update(readFileSync(archive)).digest("hex")}  ${packed.filename}\n`,
  );
}
