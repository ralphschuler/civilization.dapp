export const WLD_DECIMALS = 18;
export const CGOLD_DECIMALS = 18;
export const TRADE_FEE_BPS = 150;
export const TRADE_BPS_DENOMINATOR = 10_000;

function parseBaseUnits(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
    throw new Error("invalid_amount");
  return BigInt(value);
}

function applyFee(gross) {
  const net =
    (gross * BigInt(TRADE_BPS_DENOMINATOR - TRADE_FEE_BPS)) /
    BigInt(TRADE_BPS_DENOMINATOR);
  return { gross, net, sink: gross - net };
}

/**
 * Quote-only settlement math. It never accepts, moves, mints, or burns assets.
 * Both WLD and CGOLD use 18 decimal base units, so this illustrative price is one-to-one.
 * A production trade needs an explicit liquidity venue and on-chain settlement.
 */
export function quoteCgoldWldTrade({ side, amount }) {
  const gross = parseBaseUnits(amount);
  if (side === "buy") {
    const result = applyFee(gross);
    return {
      side,
      grossWld: result.gross.toString(),
      netCgold: result.net.toString(),
      cgoldSink: result.sink.toString(),
      wldSink: "0",
    };
  }
  if (side === "sell") {
    const result = applyFee(gross);
    return {
      side,
      grossCgold: result.gross.toString(),
      netWld: result.net.toString(),
      cgoldSink: "0",
      wldSink: result.sink.toString(),
    };
  }
  throw new Error("invalid_side");
}
