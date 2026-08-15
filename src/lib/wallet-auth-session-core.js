import { verifyWalletAuthRequest } from "./wallet-auth-verify-core.js";
import { mintWalletLoginTicket } from "./wallet-login-ticket.js";

/** Mints a session bridge ticket only after the established SIWE flow succeeds. */
export async function verifyAndMintWalletLoginTicket(body, dependencies = {}) {
  const verify =
    dependencies.verifyWalletAuthRequest ?? verifyWalletAuthRequest;
  const mint = dependencies.mintWalletLoginTicket ?? mintWalletLoginTicket;
  const result = await verify(body);
  if (result.kind !== "success") return result;
  const minted = await mint(result.address);
  if (
    !minted ||
    typeof minted !== "object" ||
    Array.isArray(minted) ||
    Object.keys(minted).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(minted, "ticket") ||
    !Object.prototype.hasOwnProperty.call(minted, "loginId")
  ) {
    throw new Error("invalid_wallet_login_ticket");
  }
  const { ticket, loginId } = minted;
  if (
    typeof ticket !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(ticket) ||
    typeof loginId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      loginId,
    )
  ) {
    throw new Error("invalid_wallet_login_ticket");
  }
  return { kind: "success", address: result.address, ticket, loginId };
}
