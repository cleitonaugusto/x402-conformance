# coinbase-agentkit adapter

Two adapters, because AgentKit's x402 behaviour differs between the npm release
and the development branch:

- `published-0.10.4.mjs` drives `@coinbase/agentkit` 0.10.4 from npm. That
  release has **no** `maxPaymentUsdc` / `registeredServices` option, so it
  measures the documented "no spend caps" behaviour — a different case from a
  limit that does not hold. Install `@coinbase/agentkit@0.10.4` and `viem` here,
  then run it from the repo root: `node --import ./no-egress.mjs run.mjs adapters/coinbase-agentkit/published-0.10.4.mjs`.

- `main-build.mjs` drives `main`, where the limit option exists but is not
  enforced on the signed payment. It imports AgentKit **built from source**,
  not from npm. Build it and point `AGENTKIT_DIST` at the output:

  ```sh
  git clone https://github.com/coinbase/agentkit
  cd agentkit/typescript
  pnpm install --frozen-lockfile --ignore-scripts --filter @coinbase/agentkit...
  pnpm exec tsc -p agentkit
  export AGENTKIT_DIST=$PWD/agentkit/dist/index.js
  ```

  then, from the repo root:
  `node --import ./no-egress.mjs run.mjs adapters/coinbase-agentkit/main-build.mjs`

These are reproducible observations about public code; results can change as the
branch moves.
