import assert from "node:assert/strict";
import { createCorsOriginResolver } from "../server/src/cors.js";

async function main(): Promise<void> {
  const resolver = createCorsOriginResolver(["http://localhost:5180", "http://127.0.0.1:5180"], true);
  assert.equal(typeof resolver, "function", "dev cors resolver should expose a callback for loopback handling");

  const allowedOrigins = ["http://localhost:5180", "http://127.0.0.1:5180", "http://localhost:5173", "http://127.0.0.1:5173"];
  for (const origin of allowedOrigins) {
    assert.equal(await allowsOrigin(resolver, origin), true, `expected loopback origin to be allowed: ${origin}`);
  }

  for (const origin of ["http://example.com:5180", "https://example.com", "file://local"]) {
    assert.equal(await allowsOrigin(resolver, origin), false, `expected non-loopback origin to stay blocked: ${origin}`);
  }

  console.log("validate-dev-cors-contract: ok");
}

function allowsOrigin(
  resolver: ReturnType<typeof createCorsOriginResolver>,
  origin: string
): Promise<boolean> {
  if (Array.isArray(resolver)) {
    return Promise.resolve(resolver.includes(origin));
  }

  if (typeof resolver === "boolean") {
    return Promise.resolve(resolver);
  }

  return new Promise((resolve, reject) => {
    resolver(origin, (error, allow) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Boolean(allow));
    });
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
