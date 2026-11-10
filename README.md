# x402 buyer conformance: does the client sign what it checked?

An agent that pays with [x402](https://github.com/x402-foundation/x402) usually checks a payment before making it: a price limit, the payee it expects, the network and asset it trusts. This harness tests whether that check applies to **the payment the client actually signs**, or only to a quote it saw earlier.

It runs a fake x402 seller on `127.0.0.1` that quotes one thing on the first `402` and asks for something else on every later one. It then decodes what the client signed and compares it with the quote and with the client's configured limit. There is no chain, no facilitator and no money: the seller only reads the authorization the client produced. Outbound connections other than loopback are blocked in the process (`no-egress.mjs`) and logged.

## Scenarios

| Scenario | First 402 (the quote) | Later 402s |
|---|---|---|
| `honest` | 0.10 USDC to `0x1111…` | the same |
| `price` | 0.10 USDC | 0.90 USDC |
| `payee` | to `0x1111…` | to `0x2222…` |
| `price+payee` | 0.10 USDC to `0x1111…` | 0.90 USDC to `0x2222…` |
| `asset` | USDC | another token |
| `network` | one Base network | the other one |
| `over-limit` | 0.90 USDC | the same |

Every adapter configures a limit of 0.50 USDC. A conforming client signs the `honest` quote and refuses the rest before signing; for `over-limit`, it refuses because the quote itself exceeds its limit.

An outcome is `SIGNED-DIFFERENT` when the signed amount exceeds the quote or the limit, or when the payee, asset or network differs from the quote. `refused` rows show the client's own reason, so a refusal caused by a misconfigured adapter is visible as such.

## Layout

Each SDK is a self-contained folder under `adapters/`:

```
adapters/
  vapi/        adapter.mjs  package.json   (+ node_modules after install)
  clawrouter/  adapter.mjs  package.json
```

The core (`server.mjs`, `run.mjs`, `no-egress.mjs`, `run-all.sh`) depends on nothing. Each adapter declares its own dependencies in its `package.json`, so the SDKs do not share an install and never interfere.

## Run

Requires Docker and `openssl`.

```sh
./run-all.sh                     # every adapter folder
./run-all.sh adapters/vapi       # one adapter
```

`run-all.sh` runs `npm install` inside the container for any adapter whose `node_modules` is missing, then runs it offline (loopback only). Results go to `results/<adapter>.log`.

To run one adapter by hand:

```sh
cd adapters/vapi && npm install && cd ../..
node --import ./no-egress.mjs run.mjs adapters/vapi
```

## Adding an SDK

Create `adapters/<name>/` with a `package.json` listing the SDK as a dependency and an `adapter.mjs` that exports:

- `name` and `LIMIT_USDC` (the limit every scenario configures, e.g. `0.5`);
- optional `SELLER` — the `network`, USDC `asset` and EIP-712 `domainName` the SDK supports (defaults to Base Sepolia);
- `modes`: named async functions that receive the seller (`url`, `quoted`) and make one payment the way an agent would. Where the SDK has a "see the quote, then pay" flow, read the first `402` before paying.

`adapters/vapi/adapter.mjs` is a short example.

## Results

Run against the current public code of three SDKs (2026-11):

| SDK | Signed something other than the quote |
|---|---|
| vAPI Network core 0.12.0 | 0 of 14 runs |
| BlockRun ClawRouter 0.12.312 | 0 of 14 runs |
| Coinbase AgentKit (`main`, unreleased, `f2f3e8c`) | 6 of 14 runs |

vAPI and ClawRouter bind their spend policy to the requirement they are about to sign and refuse every changed 402. AgentKit's development branch checks the limit against the option the model passed in while the payment is created from a fresh 402, so a quote of 0.10 USDC on a test network could be signed as 0.90 USDC to a different payee on mainnet; its released 0.10.4 has no limit option at all (documented). The AgentKit adapter builds `main` from source — see `adapters/coinbase-agentkit/README.md`.

These are reproducible observations about public code, not a ranking; run it yourself, and send adapters for the SDKs not here.

## License

MIT
