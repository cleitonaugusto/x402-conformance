// BlockRun ClawRouter (@blockrun/clawrouter 0.12.312): the x402 client built
// the way its proxy and doctor build it (library spend controls off, its own
// SpendControl registered as a payment-creation hook), with an in-memory
// policy. "limit-only": perRequest cap of 0.5. "allowlists": the same cap plus
// allowed payee, network and asset set to what the seller quoted.
//
// Install: npm install (in this folder). @blockrun/clawrouter brings @x402/*
// and viem as its own dependencies.
import { SpendControl, InMemorySpendControlStorage, registerSpendPolicyHook } from "@blockrun/clawrouter";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { base } from "viem/chains";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SELLER = { network: "eip155:8453", asset: BASE_USDC, domainName: "USD Coin" };
export const name = "blockrun-clawrouter-0.12.312";
export const LIMIT_USDC = 0.5;

function client(control) {
  const account = privateKeyToAccount(generatePrivateKey());
  const publicClient = createPublicClient({ chain: base, transport: http("http://127.0.0.1:1") });
  const x402 = new x402Client().setSpendControls(false);
  registerSpendPolicyHook(x402, control);
  registerExactEvmScheme(x402, { signer: toClientEvmSigner(account, publicClient) });
  return wrapFetchWithPayment(fetch, x402);
}

function control(withLists, seller) {
  const c = new SpendControl({ storage: new InMemorySpendControlStorage() });
  c.setLimit("perRequest", LIMIT_USDC);
  if (withLists) {
    c.setPolicy("allowedPayees", [seller.quoted.payTo]);
    c.setPolicy("allowedNetworks", [seller.quoted.network]);
    c.setPolicy("allowedAssets", [seller.quoted.asset]);
  }
  return c;
}

export const modes = {
  async "limit-only"(seller) {
    return client(control(false, seller))(seller.url);
  },
  async allowlists(seller) {
    // The operator's lists name the payee it trusts; the first 402 is what it
    // was quoted, as in the other adapters.
    await fetch(seller.url);
    return client(control(true, seller))(seller.url);
  },
};
