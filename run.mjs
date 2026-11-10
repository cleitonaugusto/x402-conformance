// Run every scenario against one adapter and print what was quoted versus
// what was signed.
//
// Usage: node --import ./no-egress.mjs run.mjs adapters/vapi
//        (a folder loads its adapter.mjs; a path to a .mjs file also works)
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { statSync } from "node:fs";
import { SCENARIOS, startSeller, verdict } from "./server.mjs";

function adapterEntry(arg) {
  const p = resolve(arg);
  return statSync(p).isDirectory() ? resolve(p, "adapter.mjs") : p;
}

const adapter = await import(pathToFileURL(adapterEntry(process.argv[2])).href);
const rows = [];
for (const [mode, run] of Object.entries(adapter.modes)) {
  for (const scenario of Object.keys(SCENARIOS)) {
    const seller = await startSeller(scenario, adapter.SELLER);
    let error = "";
    try {
      const out = await run(seller);
      if (typeof out === "string" && /"error":\s*true/.test(out)) error = (out.match(/"details":\s*"([^"]{0,90})/) || [])[1] ?? "error";
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 90);
    }
    const limit = adapter.LIMIT_USDC === undefined ? undefined : Math.round(adapter.LIMIT_USDC * 1e6);
    const v = verdict(seller.quoted, seller.signed, limit);
    rows.push({ adapter: adapter.name, mode, scenario, outcome: v.outcome, detail: [v.detail, error].filter(Boolean).join(": ") });
    await seller.close();
  }
}
console.table(rows);
const bad = rows.filter(r => r.outcome === "SIGNED-DIFFERENT");
console.log(`\n${adapter.name}: ${bad.length} of ${rows.length} runs signed something other than the quote.`);
process.exitCode = bad.length ? 1 : 0;
