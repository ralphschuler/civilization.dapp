"use client";

import { RESOURCE_ASSETS } from "../game-ui/constants.js";
import { civilizationMessages } from "../lib/civilization-locale";

type ResourceId = "wood" | "clay" | "stone";

type MarketQuote = {
  resource: ResourceId;
  amount: number;
  buyGoldIn: bigint;
  buyFee: bigint;
  sellGoldOut: bigint;
  sellFee: bigint;
  inventory: bigint;
  reserve: bigint;
  deadline: number;
};

type MarketDraft = {
  resource: ResourceId;
  from: ResourceId;
  to: ResourceId;
  amount: number;
};
type MarketOrigin = { source: string; resource: ResourceId; amount: number };
type Token = { name: string; symbol: string; externalSettlement?: boolean };

export type MarketPanelProps = {
  runtimeMode: "demo" | "world";
  tokens: Record<string, Token>;
  marketDraft: MarketDraft;
  marketQuote: MarketQuote | null;
  marketOrigin?: MarketOrigin | null;
  busy: boolean;
  copy?: ReturnType<typeof civilizationMessages>;
  onDraftChange: (draft: Partial<MarketDraft>) => void;
  onQuote: () => void;
  onOrder: (side: "buy" | "sell") => void;
  onSwap: () => void;
};

const resources: ResourceId[] = ["wood", "clay", "stone"];

function ResourceOptions({
  copy,
}: {
  copy: ReturnType<typeof civilizationMessages>;
}) {
  return (
    <>
      {resources.map((id) => (
        <option key={id} value={id}>
          {copy.resourceNames[id]}
        </option>
      ))}
    </>
  );
}

export function MarketPanel(props: MarketPanelProps) {
  const copy = props.copy || civilizationMessages();
  const quote = props.marketQuote;
  const quoteMatchesDraft =
    quote?.resource === props.marketDraft.resource &&
    quote.amount === props.marketDraft.amount;
  const canOrder = Boolean(quoteMatchesDraft) && !props.busy;
  const changeAmount = (value: string) =>
    props.onDraftChange({ amount: Number(value) });

  if (props.runtimeMode === "world") {
    return (
      <div className="inspector market-inspector">
        <div className="inspector-title">
          <p>{copy.marketTitle}</p>
          <h2>{copy.worldMarketTitle}</h2>
          <span>{copy.worldMarketDescription}</span>
        </div>
        <div className="token-registry">
          <div className="token-row token-gold">
            {/* This game asset intentionally uses the existing imperative asset path. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={RESOURCE_ASSETS.gold} alt="" />
            <span>
              <b>{copy.goldTokenTitle}</b>
              <small>{copy.goldTokenDetail}</small>
            </span>
            <em>{copy.onChain}</em>
          </div>
        </div>
        <div className="gold-boundary">
          <details className="market-liquidity-disclosure">
            <summary>
              <span>{copy.liquiditySpread}</span>
              <b>{copy.marketExplanation}</b>
            </summary>
            <small>{copy.marketDetail}</small>
          </details>
          {props.marketOrigin ? (
            <small className="market-origin" role="status">
              {copy.marketOrigin(
                props.marketOrigin.source,
                String(props.marketOrigin.amount),
                copy.resourceNames[props.marketOrigin.resource],
              )}
            </small>
          ) : null}
          <div className="market-resource-cards" aria-label={copy.resource}>
            {resources.map((resource) => (
              <button
                key={resource}
                type="button"
                className={
                  resource === props.marketDraft.resource ? "is-selected" : ""
                }
                aria-pressed={resource === props.marketDraft.resource}
                onClick={() => props.onDraftChange({ resource })}
              >
                {copy.resourceNames[resource]}
              </button>
            ))}
          </div>
          <label>
            {copy.amount}
            <input
              id="market-amount"
              type="number"
              min="1"
              value={props.marketDraft.amount}
              inputMode="numeric"
              onChange={(event) => changeAmount(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className="primary-action"
            id="market-quote"
            disabled={props.busy}
            onClick={props.onQuote}
          >
            {copy.loadQuote}
          </button>
          {quoteMatchesDraft ? (
            <div className="market-quote">
              <b>
                {copy.quoteFor(
                  String(quote.amount),
                  copy.resourceNames[quote.resource],
                )}
              </b>
              <small>
                {copy.quoteBuy(String(quote.buyGoldIn), String(quote.buyFee))}
              </small>
              <small>
                {copy.quoteSell(
                  String(quote.sellGoldOut),
                  String(quote.sellFee),
                )}
              </small>
              <small>
                {copy.quoteInventory(
                  String(quote.inventory),
                  String(quote.reserve),
                  String(quote.deadline),
                )}
              </small>
              <button
                type="button"
                id="market-buy"
                disabled={!canOrder}
                onClick={() => props.onOrder("buy")}
              >
                {copy.buyQuote}
              </button>
              <button
                type="button"
                id="market-sell"
                disabled={!canOrder}
                onClick={() => props.onOrder("sell")}
              >
                {copy.sellQuote}
              </button>
            </div>
          ) : (
            <small>{copy.quoteRequired}</small>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="inspector market-inspector">
      <div className="inspector-title">
        <p>{copy.marketTitle}</p>
        <h2>{copy.demoMarketTitle}</h2>
        <span>{copy.demoMarketDescription}</span>
      </div>
      <div className="token-registry">
        {Object.entries(props.tokens).map(([resource, token]) => (
          <div
            key={resource}
            className={`token-row ${token.externalSettlement ? "token-gold" : ""}`}
          >
            {/* This game asset intentionally uses the existing imperative asset path. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={RESOURCE_ASSETS[resource as keyof typeof RESOURCE_ASSETS]}
              alt=""
            />
            <span>
              <b>
                {token.name} · {token.symbol}
              </b>
              <small>
                {token.externalSettlement
                  ? copy.worldOnlyToken
                  : copy.internalResource}
              </small>
            </span>
            <em>
              {token.externalSettlement ? copy.worldTokenBadge : copy.internal}
            </em>
          </div>
        ))}
      </div>
      <div className="market-controls">
        <label>
          {copy.fromResource}
          <select
            id="market-from"
            value={props.marketDraft.from}
            onChange={(event) =>
              props.onDraftChange({
                from: event.currentTarget.value as ResourceId,
              })
            }
          >
            <ResourceOptions copy={copy} />
          </select>
        </label>
        <label>
          {copy.toResource}
          <select
            id="market-to"
            value={props.marketDraft.to}
            onChange={(event) =>
              props.onDraftChange({
                to: event.currentTarget.value as ResourceId,
              })
            }
          >
            <ResourceOptions copy={copy} />
          </select>
        </label>
        <label>
          {copy.amount}
          <input
            id="market-amount"
            type="number"
            min="1"
            value={props.marketDraft.amount}
            inputMode="numeric"
            onChange={(event) => changeAmount(event.currentTarget.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="primary-action"
        id="market-swap"
        onClick={props.onSwap}
      >
        {copy.swapDemo}
      </button>
      <div className="gold-boundary">
        <span>{copy.civilizationGold}</span>
        <b>{copy.demoGoldOnly}</b>
        <small>{copy.demoGoldDetail}</small>
        <button type="button" disabled>
          {copy.demoSettlementUnavailable}
        </button>
      </div>
    </div>
  );
}
