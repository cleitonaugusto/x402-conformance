// Preload: refuse every outbound connection that is not loopback, and log it.
// Keeps the reproduction from reaching any third-party service (telemetry
// included) while the container keeps working DNS for module loading.
import net from "node:net";

const LOCAL = new Set(["127.0.0.1", "localhost", "::1"]);
const blocked = [];

function hostOf(input) {
  try {
    return new URL(typeof input === "string" ? input : input.url ?? String(input)).hostname;
  } catch {
    return "?";
  }
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const host = hostOf(input);
  if (!LOCAL.has(host)) {
    blocked.push(`fetch ${host}`);
    throw new Error(`egress blocked: ${host}`);
  }
  return realFetch(input, init);
};

const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = typeof args[0] === "object" ? args[0] : { port: args[0], host: args[1] };
  const host = opts?.host ?? "localhost";
  if (opts?.path || LOCAL.has(host)) return realConnect.apply(this, args);
  blocked.push(`socket ${host}:${opts?.port}`);
  throw new Error(`egress blocked: ${host}`);
};

process.on("exit", () => {
  console.log(`\n[no-egress] blocked outbound attempts: ${blocked.length ? [...new Set(blocked)].join(", ") : "none"}`);
});
process.on("unhandledRejection", e => {
  if (!String(e?.message ?? e).startsWith("egress blocked")) console.error("unhandled:", e);
});
