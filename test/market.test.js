import test from "node:test";
import assert from "node:assert/strict";
import { TRADE_FEE_BPS, quoteImgWldTrade } from "../server/market.js";

test("buy quote retains a 1.5 percent IMG sink", () => {
  const quote = quoteImgWldTrade({ side: "buy", amount: "100000000000000000000" });
  assert.equal(TRADE_FEE_BPS, 150);
  assert.equal(quote.netImg, "98500000000000000000");
  assert.equal(quote.imgSink, "1500000000000000000");
});

test("sell quote retains a 1.5 percent WLD sink", () => {
  const quote = quoteImgWldTrade({ side: "sell", amount: "100000000000000000000" });
  assert.equal(quote.netWld, "98500000000000000000");
  assert.equal(quote.wldSink, "1500000000000000000");
});

test("quotes reject invalid sides and decimal amounts", () => {
  assert.throws(() => quoteImgWldTrade({ side: "buy", amount: "1.2" }), /invalid_amount/);
  assert.throws(() => quoteImgWldTrade({ side: "swap", amount: "1" }), /invalid_side/);
});
