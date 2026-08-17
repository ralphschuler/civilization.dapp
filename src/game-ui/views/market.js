import { RESOURCE_ASSETS } from "../constants.js";

export function marketPanel({ runtimeMode, tokens, marketQuote, busy }) {
  if (runtimeMode === "world")
    return `<div class="inspector market-inspector">
<div class="inspector-title">
<p>TAUSCHHALLE</p>
<h2>CGOLD auf World Chain</h2>
<span>Contract-Markt · keine P2P-Orders</span>
</div>
<div class="token-registry">
<div class="token-row token-gold">
<img src="${RESOURCE_ASSETS.gold}" alt="">
<span>
<b>Civilization Gold · CGOLD</b>
<small>ERC-20 · direkt im CivilizationGame</small>
</span>
<em>ON-CHAIN</em>
</div>
</div>
<div class="gold-boundary">
<span>CONTRACT-LIQUIDITÄT · 1,5 % SPREAD</span>
<b>Kaufe oder verkaufe Holz, Lehm und Stein direkt gegen CGOLD.</b>
<small>Ressourcen sind ganze Dorf-Einheiten. Preis und Quote sind CGOLD-Wei pro Einheit; Gebühren bleiben als CGOLD-Reserve im Contract.</small>
<label>Rohstoff<select id="market-resource"><option value="wood">Holz</option><option value="clay">Lehm</option><option value="stone">Stein</option></select></label>
<label>Menge<input id="market-amount" type="number" min="1" value="1" inputmode="numeric"></label>
<button class="primary-action" id="market-quote" ${busy ? "disabled" : ""}>Live-Quote laden</button>
${marketQuote ? `<div class="market-quote"><b>Quote für ${marketQuote.amount} ${marketQuote.resource}</b><small>Kauf: ${marketQuote.buyGoldIn} Wei CGOLD · Gebühr ${marketQuote.buyFee} Wei</small><small>Verkauf: ${marketQuote.sellGoldOut} Wei CGOLD · Gebühr ${marketQuote.sellFee} Wei</small><small>Inventar: ${marketQuote.inventory} · CGOLD-Reserve: ${marketQuote.reserve} · gültig bis Blockzeit ${marketQuote.deadline}</small><button id="market-buy" ${busy ? "disabled" : ""}>Kaufen (max. Quote)</button><button id="market-sell" ${busy ? "disabled" : ""}>Verkaufen (min. Quote)</button></div>` : "<small>Vor der Wallet-Bestätigung muss eine Live-Quote geladen werden.</small>"}
</div>
</div>`;
  const rows = Object.entries(tokens)
    .map(
      ([
        resource,
        token,
      ]) => `<div class="token-row ${token.externalSettlement ? "token-gold" : ""}">
<img src="${RESOURCE_ASSETS[resource]}" alt="">
<span>
<b>${token.name} · ${token.symbol}</b>
<small>${token.externalSettlement ? "Nur in World-Modus als ERC-20" : "Interne Spielressource · kein Token"}</small>
</span>
<em>${token.externalSettlement ? "WORLD" : "INTERN"}</em>
</div>`,
    )
    .join("");
  return `<div class="inspector market-inspector">
<div class="inspector-title">
<p>TAUSCHHALLE</p>
<h2>Rohstoffe handeln</h2>
<span>Lokale Demo-Buchung</span>
</div>
<div class="token-registry">${rows}</div>
<div class="market-controls">
<label>Von<select id="market-from">
<option value="wood">Holz</option>
<option value="clay">Lehm</option>
<option value="stone">Stein</option>
</select>
</label>
<label>Zu<select id="market-to">
<option value="clay">Lehm</option>
<option value="wood">Holz</option>
<option value="stone">Stein</option>
</select>
</label>
<label>Menge<input id="market-amount" type="number" min="1" value="25" inputmode="numeric">
</label>
</div>
<button class="primary-action" id="market-swap">Im Demo-Spiel tauschen</button>
<div class="gold-boundary">
<span>CIVILIZATION GOLD</span>
<b>CGOLD existiert nur im World-Chain-Contract.</b>
<small>Diese Browserdemo simuliert weder Token noch WLD-Handel.</small>
<button disabled>Settlement nicht in Demo verfügbar</button>
</div>
</div>`;
}
