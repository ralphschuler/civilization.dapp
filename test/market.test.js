import test from "node:test";
import assert from "node:assert/strict";
import { TRADE_FEE_BPS, quoteCgoldWldTrade } from "../server/market.js";

test("buy quote retains a 1.5 percent CGOLD sink", () => {
  const quote = quoteCgoldWldTrade({
    side: "buy",
    amount: "100000000000000000000",
  });
  assert.equal(TRADE_FEE_BPS, 150);
  assert.equal(quote.netCgold, "98500000000000000000");
  assert.equal(quote.cgoldSink, "1500000000000000000");
});

test("sell quote retains a 1.5 percent WLD sink", () => {
  const quote = quoteCgoldWldTrade({
    side: "sell",
    amount: "100000000000000000000",
  });
  assert.equal(quote.netWld, "98500000000000000000");
  assert.equal(quote.wldSink, "1500000000000000000");
});

test("quotes reject invalid sides and decimal amounts", () => {
  assert.throws(
    () => quoteCgoldWldTrade({ side: "buy", amount: "1.2" }),
    /invalid_amount/,
  );
  assert.throws(
    () => quoteCgoldWldTrade({ side: "swap", amount: "1" }),
    /invalid_side/,
  );
});
