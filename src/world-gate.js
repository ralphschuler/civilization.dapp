// A World Mini App must not expose the game UI until both steps of the access
// flow have completed. `verified` is assigned only after the v4 proof,
// MiniKit submission, and a World Chain mainnet playerState read confirm the
// wallet's registration.
export function canRenderGameWorld({ worldAppInstalled, worldIdStatus }) {
  return !worldAppInstalled || worldIdStatus === "verified";
}

export function canRetryWorldIdVerification(worldIdStatus) {
  return worldIdStatus === "not_verified" || worldIdStatus === "error";
}
