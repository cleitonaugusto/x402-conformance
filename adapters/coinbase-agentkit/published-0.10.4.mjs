// Coinbase AgentKit x402 action provider, driven the way an agent drives it:
// make_http_request (see the quote), then retry_http_request_with_x402 with
// the option it was shown. A second mode uses make_http_request_with_x402.
import { x402ActionProvider, ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, http as viemHttp } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// 0.10.4 has no limit option (maxPaymentUsdc is ignored): this adapter shows
// the documented "no spend caps" behavior, not the bug reported for main.
export const name = "coinbase-agentkit-0.10.4-no-limit-option";
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
