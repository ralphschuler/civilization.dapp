// The release plan is the same deterministic, no-send preflight used by both networks.
// It validates the reviewed source commit, frozen schema, explicit 50/50 split,
// compiled OZ v5 imports, and deterministic nonce-derived manifest.
await import("./worldchain-proxy-preflight.mjs");
