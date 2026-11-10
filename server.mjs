// A fake x402 seller for conformance tests. It quotes one thing on the first
// 402 and asks for something else on every later one, then reports what the
// client actually signed. No chain, no facilitator, no funds.
//
// The question it answers for a buyer SDK: is the limit (and the payee) that
// was checked the same one that gets signed?
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";

export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const PAYEE_QUOTED = "0x1111111111111111111111111111111111111111";
export const PAYEE_SWAPPED = "0x2222222222222222222222222222222222222222";
export const ASSET_SWAPPED = "0x3333333333333333333333333333333333333333";

// Each scenario: what the first 402 quotes, and what every later 402 asks for.
export const SCENARIOS = {
  honest: { quoted: { amount: 100000 }, later: { amount: 100000 } },
  price: { quoted: { amount: 100000 }, later: { amount: 900000 } },
  payee: { quoted: { amount: 100000 }, later: { amount: 100000, payTo: PAYEE_SWAPPED } },
  "price+payee": { quoted: { amount: 100000 }, later: { amount: 900000, payTo: PAYEE_SWAPPED } },
  asset: { quoted: { amount: 100000 }, later: { amount: 100000, asset: ASSET_SWAPPED } },
  network: { quoted: { amount: 100000 }, later: { amount: 100000, network: "swap" } },
  // The quote itself is above the buyer's configured limit: a conforming
  // client refuses before signing anything.
  "over-limit": { quoted: { amount: 900000 }, later: { amount: 900000 } },
};

// The network and USDC the seller quotes in; adapters may pick another pair
// their SDK supports. "swap" moves to the other Base network.
export const DEFAULT_BASE = { network: "eip155:84532", asset: USDC_BASE_SEPOLIA, domainName: "USDC" };
const OTHER_NETWORK = { "eip155:84532": "eip155:8453", "eip155:8453": "eip155:84532" };

function requirements(url, spec, base) {
  const { amount, payTo = PAYEE_QUOTED } = spec;
  const asset = spec.asset ?? base.asset;
  const network = spec.network === "swap" ? OTHER_NETWORK[base.network] ?? "eip155:1" : spec.network ?? base.network;
  return {
    x402Version: 2,
    resource: { url, description: "conformance", mimeType: "application/json" },
    accepts: [
      { scheme: "exact", network, amount: String(amount), asset, payTo, maxTimeoutSeconds: 60, extra: { name: base.domainName, version: "2" } },
    ],
  };
}

function decode(b64) {
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(b64);
    } catch {
      return { raw: b64 };
    }
  }
}

/** Start a seller for `scenario` on 127.0.0.1. Returns { url, signed, quoted, close }. */
export async function startSeller(scenario, base = DEFAULT_BASE, port = 0) {
  const spec = SCENARIOS[scenario];
  if (!spec) throw new Error(`unknown scenario ${scenario}`);
  let unpaid = 0;
  const signed = [];
  let url = "";
  // SELLER_TLS_DIR (cert.pem, key.pem) serves HTTPS, for SDKs that refuse to
  // pay a plain-HTTP endpoint. The client must trust it (NODE_EXTRA_CA_CERTS).
  const tls = process.env.SELLER_TLS_DIR;
  const make = tls
    ? handler => https.createServer({ cert: readFileSync(`${tls}/cert.pem`), key: readFileSync(`${tls}/key.pem`) }, handler)
    : handler => http.createServer(handler);
  const server = make((req, res) => {
    const pay = req.headers["payment-signature"] ?? req.headers["x-payment"];
    if (pay) {
      const payload = decode(pay);
      const auth = payload?.payload?.authorization ?? {};
      signed.push({
        value: auth.value,
        to: auth.to,
        network: payload?.accepted?.network ?? payload?.network,
        asset: payload?.accepted?.asset,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    unpaid += 1;
    const body = requirements(url, unpaid === 1 ? spec.quoted : spec.later, base);
    res.writeHead(402, {
      "content-type": "application/json",
      "payment-required": Buffer.from(JSON.stringify(body)).toString("base64"),
    });
    res.end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  url = `${tls ? "https" : "http"}://127.0.0.1:${server.address().port}/paid`;
  return {
    url,
    quoted: { amount: spec.quoted.amount, payTo: PAYEE_QUOTED, asset: base.asset, network: base.network },
    signed,
    close: () => new Promise(r => server.close(r)),
  };
}

/** Did the client sign something other than what was quoted, or above its limit? */
export function verdict(quoted, signed, limitAtomic) {
  if (signed.length === 0) return { outcome: "refused", detail: "nothing signed" };
  const s = signed.at(-1);
  const drift = [];
  if (limitAtomic !== undefined && s.value !== undefined && BigInt(s.value) > BigInt(limitAtomic)) {
    drift.push(`above the configured limit (${limitAtomic}): ${s.value}`);
  }
  if (s.value !== undefined && BigInt(s.value) > BigInt(quoted.amount)) drift.push(`amount ${quoted.amount} -> ${s.value}`);
  if (s.to && s.to.toLowerCase() !== quoted.payTo.toLowerCase()) drift.push(`payee ${quoted.payTo} -> ${s.to}`);
  if (s.asset && s.asset.toLowerCase() !== quoted.asset.toLowerCase()) drift.push(`asset -> ${s.asset}`);
  if (s.network && s.network !== quoted.network) drift.push(`network -> ${s.network}`);
  return drift.length ? { outcome: "SIGNED-DIFFERENT", detail: drift.join("; ") } : { outcome: "signed-as-quoted", detail: "" };
}
