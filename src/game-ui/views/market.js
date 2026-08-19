import { RESOURCE_ASSETS } from "../constants.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";

function resourceOptions(copy) {
  return ["wood", "clay", "stone"]
    .map((id) => `<option value="${id}">${copy.resourceNames[id]}</option>`)
    .join("");
}

export function marketPanel({
  runtimeMode,
  tokens,
  marketQuote,
  busy,
  copy = civilizationMessages("de-DE"),
}) {
  const options = resourceOptions(copy);
  if (runtimeMode === "world") {
    const quote = marketQuote
      ? `<div class="market-quote"><b>${copy.quoteFor(marketQuote.amount, copy.resourceNames[marketQuote.resource])}</b><small>${copy.quoteBuy(marketQuote.buyGoldIn, marketQuote.buyFee)}</small><small>${copy.quoteSell(marketQuote.sellGoldOut, marketQuote.sellFee)}</small><small>${copy.quoteInventory(marketQuote.inventory, marketQuote.reserve, marketQuote.deadline)}</small><button id="market-buy" ${busy ? "disabled" : ""}>${copy.buyQuote}</button><button id="market-sell" ${busy ? "disabled" : ""}>${copy.sellQuote}</button></div>`
      : `<small>${copy.quoteRequired}</small>`;
    return `<div class="inspector market-inspector"><div class="inspector-title"><p>${copy.marketTitle}</p><h2>${copy.worldMarketTitle}</h2><span>${copy.worldMarketDescription}</span></div><div class="token-registry"><div class="token-row token-gold"><img src="${RESOURCE_ASSETS.gold}" alt=""><span><b>${copy.goldTokenTitle}</b><small>${copy.goldTokenDetail}</small></span><em>${copy.onChain}</em></div></div><div class="gold-boundary"><span>${copy.liquiditySpread}</span><b>${copy.marketExplanation}</b><small>${copy.marketDetail}</small><label>${copy.resource}<select id="market-resource">${options}</select></label><label>${copy.amount}<input id="market-amount" type="number" min="1" value="1" inputmode="numeric"></label><button class="primary-action" id="market-quote" ${busy ? "disabled" : ""}>${copy.loadQuote}</button>${quote}</div></div>`;
  }
  const rows = Object.entries(tokens)
    .map(
      ([resource, token]) =>
        `<div class="token-row ${token.externalSettlement ? "token-gold" : ""}"><img src="${RESOURCE_ASSETS[resource]}" alt=""><span><b>${token.name} · ${token.symbol}</b><small>${token.externalSettlement ? copy.worldOnlyToken : copy.internalResource}</small></span><em>${token.externalSettlement ? copy.worldTokenBadge : copy.internal}</em></div>`,
    )
    .join("");
  return `<div class="inspector market-inspector"><div class="inspector-title"><p>${copy.marketTitle}</p><h2>${copy.demoMarketTitle}</h2><span>${copy.demoMarketDescription}</span></div><div class="token-registry">${rows}</div><div class="market-controls"><label>${copy.fromResource}<select id="market-from">${options}</select></label><label>${copy.toResource}<select id="market-to"><option value="clay">${copy.resourceNames.clay}</option><option value="wood">${copy.resourceNames.wood}</option><option value="stone">${copy.resourceNames.stone}</option></select></label><label>${copy.amount}<input id="market-amount" type="number" min="1" value="25" inputmode="numeric"></label></div><button class="primary-action" id="market-swap">${copy.swapDemo}</button><div class="gold-boundary"><span>${copy.civilizationGold}</span><b>${copy.demoGoldOnly}</b><small>${copy.demoGoldDetail}</small><button disabled>${copy.demoSettlementUnavailable}</button></div></div>`;
}
