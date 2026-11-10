// Coinbase AgentKit x402 action provider, driven the way an agent drives it:
// make_http_request (see the quote), then retry_http_request_with_x402 with
// the option it was shown. A second mode uses make_http_request_with_x402.
//
// AgentKit's x402 limit option lives on `main`, not on the npm release, so this
// imports a build from source. Point AGENTKIT_DIST at the built package, e.g.:
//   git clone https://github.com/coinbase/agentkit && cd agentkit/typescript
//   pnpm install --frozen-lockfile --ignore-scripts --filter @coinbase/agentkit...
//   pnpm exec tsc -p agentkit
//   export AGENTKIT_DIST=$PWD/agentkit/dist/index.js
import { pathToFileURL } from "node:url";
const DIST = process.env.AGENTKIT_DIST;
if (!DIST) throw new Error("set AGENTKIT_DIST to a built @coinbase/agentkit dist/index.js (see this file's header)");
const agentkit = (await import(pathToFileURL(DIST).href)).default;
const { x402ActionProvider, ViemWalletProvider } = agentkit;
import { createWalletClient, http as viemHttp } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const name = "coinbase-agentkit-main-f2f3e8c";
// The limit the developer configured; the quote is always below it.
export const LIMIT_USDC = 0.5;

function wallet() {
  const account = privateKeyToAccount(generatePrivateKey());
  const client = createWalletClient({ account, chain: baseSepolia, transport: viemHttp("http://127.0.0.1:1") });
  return new ViemWalletProvider(client);
}

const none = { headers: null, queryParams: null, body: null };

export const modes = {
  async "two-step"(seller) {
    const w = wallet();
    const p = x402ActionProvider({ registeredServices: [new URL(seller.url).origin], maxPaymentUsdc: LIMIT_USDC });
    await p.makeHttpRequest(w, { url: seller.url, method: "GET", ...none });
    const q = seller.quoted;
    return p.retryWithX402(w, {
      url: seller.url, method: "GET", ...none,
      selectedPaymentOption: { scheme: "exact", network: q.network, asset: q.asset, maxAmountRequired: null, amount: String(q.amount), price: null, payTo: q.payTo },
    });
  },
  async automatic(seller) {
    const w = wallet();
    const p = x402ActionProvider({ registeredServices: [new URL(seller.url).origin], maxPaymentUsdc: LIMIT_USDC });
    return p.makeHttpRequestWithX402(w, { url: seller.url, method: "GET", ...none });
  },
};
