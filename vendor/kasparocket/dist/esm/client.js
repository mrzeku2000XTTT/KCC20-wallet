/**
 * The KaspaRocket client.
 *
 * Three principles, which explain most of the choices in this file.
 *
 * 1. The SDK signs nothing. Every method that produces a transaction returns an
 *    UNSIGNED one. The `…AndSubmit` variants exist, but they take a `Signer` as
 *    a parameter — the key stays with the integrator.
 *
 * 2. Every amount is a `bigint`. See `types.ts` for why: a u64 in a `number`
 *    silently loses units.
 *
 * 3. The partner's fee address is NOT a parameter. It is attached to the API key
 *    server-side. Putting it here would have achieved nothing — the server would
 *    ignore the value — and exposing it would have suggested it mattered.
 */
import { Catalogue } from "./catalogue.js";
import { Http } from "./http.js";
import { Tokens } from "./tokens.js";
import { KaspaRocketError } from "./errors.js";
import { computeFees, formatTokens } from "./protocol.js";
/**
 * Where each network lives.
 *
 * One host serves both APIs: transactions under `/pro-api`, the catalogue under
 * `/api`. They are separate services behind it, joined by a same-origin proxy —
 * which is also why an integrator needs no CORS setup.
 *
 * A network absent from these tables is not deployed. The client then demands
 * an explicit `apiUrl` rather than guessing: the previous defaults pointed at
 * `api-testnet.kasparocket.com` and `testnet.kasparocket.com`, neither of which
 * has a DNS record. An integrator writing `new KaspaRocket({ network })` hit an
 * unresolvable host on their very first call, with nothing to suggest the SDK
 * was at fault.
 */
const API_ROOTS = {
    "testnet-10": "https://kasparocket.fun/pro-api",
};
const CATALOGUE_ROOTS = {
    "testnet-10": "https://kasparocket.fun",
};
export class KaspaRocket {
    constructor(options = {}) {
        this.protocolCache = null;
        this.protocolInFlight = null;
        const network = options.network ?? "mainnet";
        const root = options.apiUrl ?? API_ROOTS[network];
        if (!root) {
            throw new KaspaRocketError("invalid_request", `network "${network}" has no public deployment yet. ` +
                `Deployed: ${Object.keys(API_ROOTS).join(", ")}. ` +
                `Pass \`apiUrl\` (and \`catalogueUrl\`) to point at your own instance.`);
        }
        const f = options.fetch ?? globalThis.fetch;
        if (typeof f !== "function") {
            throw new KaspaRocketError("invalid_request", "no fetch implementation available. Node 18+ ships one; otherwise pass " +
                "`fetch` in the options.");
        }
        this.hasKey = Boolean(options.apiKey);
        const common = {
            ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
            timeoutMs: options.timeoutMs ?? 30000,
            maxRetries: options.maxRetries ?? 2,
            fetch: f.bind(globalThis),
            userAgent: "kasparocket-sdk/0.1.0",
        };
        this.http = new Http({ ...common, baseUrl: root.replace(/\/$/, "") });
        // The catalogue may live at the same root as transactions — that is the
        // case when everything goes through one proxy, as on the website — or at
        // a distinct root. Both work with nothing else changed.
        const catalogueRoot = options.catalogueUrl ?? CATALOGUE_ROOTS[network] ?? root;
        const catalogueBase = catalogueRoot.replace(/\/$/, "");
        this.catalogue = new Catalogue(
        // `convertAmounts: false` — the catalogue does not send u64s as
        // strings, and its same-named fields (`amount`, `value`, `open`) do
        // not mean what they mean on a transaction.
        new Http({ ...common, baseUrl: catalogueBase, convertAmounts: false }));
        // The bot is reverse-proxied under /api/bot by the Node API, so it sits
        // at the SAME root as the catalogue — but its amounts really are 64-bit
        // sompi, hence a distinct client that converts them. Sharing the
        // catalogue's would have returned `amountSompi` as a string, and the
        // caller's arithmetic would have broken further along.
        this.tokens = new Tokens(new Http({ ...common, baseUrl: catalogueBase }));
    }
    // -----------------------------------------------------------------------
    // Protocol
    // -----------------------------------------------------------------------
    /**
     * The schedule and limits in force FOR THIS CALLER.
     *
     * The answer depends on the key: an authenticated partner receives their own
     * schedule. The result is cached for the client's lifetime — tariffs do not
     * change mid-session, and re-reading it on every quote would be one
     * round-trip too many.
     */
    async protocol(options = {}) {
        if (this.protocolCache && !options.refresh)
            return this.protocolCache;
        // Two simultaneous calls at startup must produce only one request.
        if (!this.protocolInFlight || options.refresh) {
            this.protocolInFlight = this.http
                .get("/protocol")
                .then((p) => {
                this.protocolCache = p;
                return p;
            })
                .finally(() => {
                this.protocolInFlight = null;
            });
        }
        return this.protocolInFlight;
    }
    /**
     * What a given flow will cost in fees, for display.
     *
     * Purely local: no network call, so usable on every keystroke. The amount
     * that counts remains the plan's — this one is to show, not to commit.
     */
    estimateFees(kasFlowSompi) {
        return computeFees(kasFlowSompi, {
            partner: this.hasKey,
            protocol: this.protocolCache,
        });
    }
    // -----------------------------------------------------------------------
    // Reads
    // -----------------------------------------------------------------------
    async health() {
        return this.http.get("/health");
    }
    async balance(address) {
        // Returned AS-IS. Reshaping it here lost `balance_kas` and read a
        // `balance` field the server does not send: the balance came back as
        // zero with nothing to flag it.
        return this.http.get(`/balance/${encodeURIComponent(address)}`);
    }
    async holdings(address) {
        return this.http.get(`/tokens/${encodeURIComponent(address)}`);
    }
    async holding(address, tokenId) {
        return this.http.get(`/tokens/${encodeURIComponent(address)}/${encodeURIComponent(tokenId)}`);
    }
    /**
     * Buys a token a promoted slot — the "sponsored" rank of `catalogue.feed()`.
     *
     * Returns an unsigned plan like any other. What is unusual is where the
     * money goes: ONE transaction, two outputs. The treasury takes its share
     * and, when you present a partner key, **you take 30 %** — you brought the
     * user and you carry the interface. Bought from the KaspaRocket site there
     * is no intermediary, so the treasury takes all of it.
     *
     * ```ts
     * const plan = await kr.planSponsor({
     *     address: userAddress, tokenId, durationMinutes: 60,
     * })
     * await kr.signAndSubmit(plan, mySigner)   // forwards `sponsor_row` for you
     * ```
     *
     * Two outputs in one transaction rather than two transfers, and that is the
     * point: the split becomes indivisible. Two separate sends is one that can
     * land without the other.
     *
     * **Do not build the payment yourself.** The server re-reads the broadcast
     * transaction's outputs before recording the promotion, and refuses if
     * either share is missing or short. A hand-rolled payment is not cheaper,
     * it just does not register — and the KAS is spent either way.
     *
     * The price is dynamic: base rate times how long the queue makes you wait.
     * `catalogue.adPricing(tokenId)` quotes it without committing to anything.
     */
    async planSponsor(params) {
        return this.http.post("/plan/sponsor", {
            address: params.address,
            token_id: params.tokenId,
            duration_minutes: params.durationMinutes,
        });
    }
    /**
     * Pays SEVERAL recipients in one transaction.
     *
     * One transaction rather than N transfers, and the difference matters: the
     * shares become indivisible — accepted together or refused together — and
     * the payer signs once instead of N times.
     *
     * Spends only `address`'s own UTXOs, and comes back UNSIGNED. Building a
     * plan for someone else therefore grants nothing.
     *
     * **Sum per recipient before calling.** Two outputs to the same address are
     * refused: they waste storage mass for nothing, and adding up first forces
     * you to know what you are sending to whom.
     *
     * Each share must be at least **0.5 KAS**. Storage mass counts
     * `10^12 / value` per output, so one tiny share inflates the mass of the
     * WHOLE transaction and gets it refused — taking the correct shares down
     * with it. The server names the offending ones rather than letting the node
     * reject the lot.
     */
    async planPayment(params) {
        return this.http.post("/plan/payment", {
            address: params.address,
            outputs: params.outputs.map((o) => ({
                address: o.address,
                amount_sompi: o.amountSompi.toString(),
            })),
        });
    }
    /** A token's order book: resting bids and asks. */
    async orderBook(tokenId) {
        return this.http.get(`/book/${encodeURIComponent(tokenId)}`);
    }
    /**
     * The orders belonging to an address.
     *
     * Open ones by default. Pass `includeClosed` for the filled and cancelled
     * ones too — history, not something to act on.
     */
    async orders(address, options = {}) {
        return this.http.get(`/orders/${encodeURIComponent(address)}`, {
            include_closed: options.includeClosed ? "true" : undefined,
        });
    }
    /**
     * Pool statistics.
     *
     * `points` controls how many raw price samples come back with them. It
     * defaults to the server's own default; pass `0` when you only need the
     * aggregates. That series is the bulk of the payload — roughly 88 bytes a
     * point, up to a thousand of them — so on a widget that polls every few
     * seconds, asking for points you never read is most of the traffic.
     *
     * `holders` comes back capped at the top 25 by default. `allHolders` lifts
     * the cap; either way the response carries `holders_truncated`, and anything
     * that splits money between holders MUST read it. Distributing pro rata over
     * a truncated list pays the top slice 100 % of the amount and says nothing —
     * the weights still add up, so the screen looks right.
     */
    async poolStats(lpCovenantId, tokenId, options = {}) {
        return this.http.get("/pool/stats", {
            lp_covenant_id: lpCovenantId,
            kcc20_covenant_id: tokenId,
            points: options.points,
            all_holders: options.allHolders ? "true" : undefined,
        });
    }
    async candles(lpCovenantId, tokenId, options = {}) {
        return this.http.get("/pool/candles", {
            lp_covenant_id: lpCovenantId,
            kcc20_covenant_id: tokenId,
            tf: options.timeframe ?? "15m",
            before: options.before,
            limit: options.limit ?? 500,
        });
    }
    // -----------------------------------------------------------------------
    // Quoting and routing
    // -----------------------------------------------------------------------
    /** Prices a swap against the CURRENT pool state. Reserves nothing. */
    async quote(params) {
        const r = await this.http.post("/pool/quote", {
            lp_covenant_id: params.lpCovenantId,
            kcc20_covenant_id: params.tokenId,
            direction: params.direction,
            amount_tokens: params.amountTokens?.toString(),
            kas_budget_sompi: params.kasBudgetSompi?.toString(),
        });
        const big = (k) => (typeof r[k] === "bigint" ? r[k] : 0n);
        const amountTokens = big("amount_tokens");
        return {
            direction: params.direction,
            amountTokens,
            amountTokensDisplay: formatTokens(amountTokens),
            kasFlowSompi: big("kas_flow_sompi"),
            fee: {
                treasury: big("platform_fee_sompi"),
                partner: big("partner_fee_sompi"),
                total: big("total_fee_sompi") || big("platform_fee_sompi"),
            },
            netKasSompi: big("net_kas_sompi"),
            uneconomic: r["uneconomic"] === true,
            phase: r["phase"] ?? "bonding",
            reserveTokens: big("reserve_tokens"),
            reserveKasSompi: big("reserve_kas_sompi"),
            spotBeforeSompi: big("spot_before_sompi"),
            spotAfterSompi: big("spot_after_sompi"),
        };
    }
    /**
     * Previews an order: how it would split between the curve and the book, and
     * what it would cost. Signs nothing and reserves nothing.
     *
     * The response's `attendu` field is the anti-sandwich commitment: passing it
     * back to `planTrade` makes execution refuse if the market moved.
     */
    async route(params) {
        return this.http.post("/route", this.tradeBody(params));
    }
    // -----------------------------------------------------------------------
    // Building transactions — nothing is signed here
    // -----------------------------------------------------------------------
    /** A swap on the curve, with an optional order placement in the same transaction. */
    async planSwap(params) {
        return this.http.post("/plan/swap", {
            address: params.address,
            lp_covenant_id: params.lpCovenantId,
            kcc20_covenant_id: params.tokenId,
            direction: params.direction,
            amount_tokens: params.amountTokens?.toString(),
            kas_budget_sompi: params.kasBudgetSompi?.toString(),
            order_side: params.order?.side,
            order_price_sompi: params.order?.priceSompi?.toString(),
            order_tokens: params.order?.tokens?.toString(),
        });
    }
    /**
     * A complete order in one transaction: curve and book together.
     *
     * This is the normal path for a buy or a sell. `planSwap` only touches the
     * curve and ignores the book, which often gives a worse price.
     */
    async planTrade(params) {
        return this.http.post("/plan/trade", this.tradeBody(params));
    }
    /** Consumes ONE order from the book, with no curve leg. */
    async planFillOrder(params) {
        return this.http.post("/plan/order/fill", {
            address: params.address,
            order_id: params.orderId,
            fill_amount: params.fillAmount?.toString(),
        });
    }
    /**
     * Recovers an order's funds: the KAS of a buy, the tokens of a sell.
     *
     * Not billable — a cancellation moves nothing that could be.
     */
    async planCancelOrder(params) {
        return this.http.post("/plan/order/cancel", {
            address: params.address,
            order_id: params.orderId,
        });
    }
    /** Sends KAS. `amountSompi` at zero sends the whole balance. */
    async planSend(params) {
        return this.http.post("/plan/send", {
            address: params.address,
            destination_address: params.destination,
            amount_sompi: params.amountSompi.toString(),
        });
    }
    /** Transfers KCC20 tokens. */
    async planTransfer(params) {
        return this.http.post("/plan/transfer", {
            address: params.address,
            kcc20_covenant_id: params.tokenId,
            // `recipient_address` et `amount_tokens`, pas `destination_address`
            // ni `amount` : ce sont les noms que le serveur declare. Les deux
            // etaient faux depuis l'ecriture de cette methode, donc AUCUN
            // transfert de jeton n'a jamais abouti par le SDK — 422 sur
            // « Field required », sans que rien ne pointe vers le SDK.
            //
            // Les tests ne pouvaient pas le voir : ils rejouent des reponses
            // capturees, ils ne verifient pas qu'une requete est acceptable.
            // C'est `test_corps_de_requete.py` qui garde ca maintenant.
            recipient_address: params.destination,
            amount_tokens: params.amountTokens.toString(),
        });
    }
    /**
     * Is a transaction's UTXO visible to the node yet?
     *
     * Broadcasting is not settling. A plan that depends on the previous one's
     * outputs — a merge before a sell, a leg of a split order — fails on
     * "UTXO not found" if you chain them straight away.
     */
    async isUtxoConfirmed(address, txid) {
        return this.http.get(`/utxo-confirmed/${encodeURIComponent(address)}/${encodeURIComponent(txid)}`);
    }
    /**
     * Has the indexer digested a broadcast transaction?
     *
     * Stronger than `isUtxoConfirmed`, and a different question. Between two
     * legs of a split order you must wait for the INDEXER, not just the node:
     * routing again before the parser and trade engine have caught up means
     * routing against a stale book and a stale pool.
     *
     * (`prete` — "ready" — is the server's JSON key, transcribed verbatim.)
     */
    async txIndexed(txid) {
        return this.http.get(`/tx/${encodeURIComponent(txid)}/etat`);
    }
    /**
     * Waits for the indexer, polling.
     *
     * Throws on timeout rather than returning false: a caller that ignored a
     * false would chain the next leg onto stale state, and fail further away
     * from the cause.
     */
    async waitTxIndexed(txid, timeoutMs = 30000) {
        const start = Date.now();
        for (;;) {
            try {
                if ((await this.txIndexed(txid)).prete)
                    return;
            }
            catch {
                // The service may catch its breath between blocks: retry.
            }
            if (Date.now() - start > timeoutMs) {
                throw new KaspaRocketError("unavailable", `transaction ${txid} still not indexed after ` +
                    `${Math.round(timeoutMs / 1000)}s. Anything chained behind it would ` +
                    `route against stale state.`, { endpoint: `/tx/${txid}/etat` });
            }
            await new Promise((r) => setTimeout(r, 900));
        }
    }
    /**
     * Consolidates scattered token UTXOs into one.
     *
     * A sell spends a bounded number of KCC20 inputs. Past that, the holding
     * must be merged first — one extra transaction, one extra signature, which
     * is why `route()` announces them up front rather than letting the build
     * fail.
     */
    async planMerge(params) {
        return this.http.post("/plan/merge", {
            address: params.address,
            kcc20_covenant_id: params.tokenId,
            target_tokens: params.targetTokens.toString(),
        });
    }
    /**
     * Places a limit order, alone.
     *
     * Charges nothing: the platform fee is taken when the order FILLS, not when
     * it is posted. You earn on the fills you build, not on this call.
     */
    async planCreateOrder(params) {
        return this.http.post("/plan/order/create", {
            address: params.address,
            lp_covenant_id: params.lpCovenantId,
            kcc20_covenant_id: params.tokenId,
            side: params.side,
            price_sompi: params.priceSompi.toString(),
            tokens: params.tokens.toString(),
        });
    }
    // -----------------------------------------------------------------------
    // Broadcasting
    // -----------------------------------------------------------------------
    /**
     * Submits an ALREADY SIGNED transaction.
     *
     * Deliberately outside the SDK's retry mechanism: replaying a submission can
     * end in a double send, and it is for the caller to decide whether their
     * case tolerates that.
     */
    async submit(transactions, orderRow, 
    /**
     * The `sponsor_row` from `planSponsor`. Same discipline as `orderRow`:
     * hand back what the server gave you, unchanged. The price and the
     * split it carries are the ones the server computed — it re-reads the
     * broadcast transaction's outputs before recording, so an altered row
     * is refused rather than believed.
     */
    sponsorRow) {
        return this.http.post("/submit", {
            transactions,
            ...(orderRow ? { order_row: orderRow } : {}),
            ...(sponsorRow ? { sponsor_row: sponsorRow } : {}),
        }, { noRetry: true });
    }
    /**
     * Signs then submits a plan, in order.
     *
     * A plan may carry SEVERAL chained transactions: the next one's outpoints
     * reference the previous. They are therefore submitted in sequence, and a
     * failure interrupts the rest — carrying on would send transactions whose
     * inputs do not exist.
     *
     * When the plan PLACES an order, its `order_row` is forwarded with the LAST
     * submission — the order only exists once the whole chain is on the wire,
     * and registering it earlier would advertise an order backed by a
     * transaction that may still fail. Forgetting to forward it at all leaves
     * the order invisible for good; see `TransactionPlan.order_row`.
     */
    async signAndSubmit(plan, signer) {
        const results = [];
        const last = plan.transactions.length - 1;
        for (const [i, planned] of plan.transactions.entries()) {
            const signed = await signer.sign(planned);
            try {
                // One at a time, NOT in a batch: each transaction spends the
                // previous one's outputs, and the server broadcasts them in the
                // order received. Sending them together would get the second
                // rejected for an input the node has not seen yet.
                results.push(i === last
                    ? await this.submit([signed], plan.order_row, plan.sponsor_row)
                    : await this.submit([signed]));
            }
            catch (cause) {
                if (i === 0)
                    throw cause;
                throw new KaspaRocketError(cause instanceof KaspaRocketError ? cause.kind : "unknown", `transaction ${i + 1} of ${plan.transactions.length} failed. The ` +
                    `${i} before it ARE broadcast — the chain is interrupted, not rolled ` +
                    `back. Replaying the whole plan would create duplicates.`, { cause, details: results });
            }
        }
        return results;
    }
    // -----------------------------------------------------------------------
    tradeBody(p) {
        return {
            address: p.address ?? null,
            lp_covenant_id: p.lpCovenantId,
            kcc20_covenant_id: p.tokenId,
            side: p.side,
            kind: p.kind,
            budget_sompi: p.budgetSompi?.toString(),
            tokens: p.tokens?.toString(),
            limit_price_sompi: p.limitPriceSompi?.toString(),
            max_fills: p.maxFills ?? 3,
            attendu: p.expected ?? null,
            apres_tx: p.afterTx ?? null,
        };
    }
}
//# sourceMappingURL=client.js.map