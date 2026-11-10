// vAPI Network core (@vapi-network/core 0.12.0), driven like its MCP `call`
// tool: the agent first sees the quote, then pays with the payee it saw as
// `expectedPayTo` and its limit as `maxPriceUsd`; the per-call cap is the same
// limit. "automatic" pays without a prior quote, under the per-call cap only.
//
// Install: npm install (in this folder).
import { completeX402Payment, getDefaultConfig } from "@vapi-network/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// vAPI only accepts canonical USDC, so the seller quotes on Base mainnet
// (still a local fake: nothing reaches a chain).
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SELLER = { network: "eip155:8453", asset: BASE_USDC, domainName: "USD Coin" };

export const name = "vapi-network-core-0.12.0";
export const LIMIT_USDC = 0.5;
const LIMIT_ATOMIC = String(Math.round(LIMIT_USDC * 1e6));

function config() {
  const c = getDefaultConfig();
  c.allowPrivateNetwork = true;
  c.networks = {
    "eip155:8453": { usdc: BASE_USDC, rpcUrl: "http://127.0.0.1:1" },
    "eip155:84532": { usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", rpcUrl: "http://127.0.0.1:1" },
  };
  return c;
}

function attempt(response, request) {
  return { response, request, finish() {}, waitFor: op => op };
}

async function pay(seller, { maxPriceUsd, expectedPayTo }) {
  const account = privateKeyToAccount(generatePrivateKey());
  const request = new Request(seller.url, { method: "GET", redirect: "manual" });
  const first = await fetch(request.clone());
  return completeX402Payment({
    challenge: attempt(first, request),
    account,
    caps: { perCallAtomic: LIMIT_ATOMIC, perDayAtomic: "100000000" },
    config: config(),
    send: async paid => attempt(await fetch(paid), paid),
    consumeResponse: r => r.text(),
    fetchImpl: fetch,
    ledgerPath: `/tmp/vapi-ledger-${Math.random().toString(36).slice(2)}.json`,
    ...(maxPriceUsd === undefined ? {} : { maxPriceUsd }),
    ...(expectedPayTo === undefined ? {} : { expectedPayTo }),
    ceilingSweep: false,
  });
}

export const modes = {
  async "two-step"(seller) {
    // The agent reads the quote first (the seller's first 402)...
    await fetch(seller.url);
    // ...then calls with what it saw.
    return pay(seller, { maxPriceUsd: LIMIT_USDC, expectedPayTo: seller.quoted.payTo });
  },
  async automatic(seller) {
    return pay(seller, {});
  },
};
