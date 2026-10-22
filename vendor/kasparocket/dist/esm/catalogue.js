/** The durations actually on sale, read from the response rather than assumed. */
export function soldDurations(pricing) {
    return Object.keys(pricing)
        .map((k) => /^price_(\d+)_min$/.exec(k)?.[1])
        .filter((m) => m !== undefined)
        .map(Number)
        .sort((a, b) => a - b);
}
/**
 * The level a token is AIMING AT, or `null` if it has cleared them all.
 *
 * Written once here rather than in every caller: the rule "the target level is
 * `level + 1`" is a protocol convention, not self-evident. The next level is not
 * necessarily the next rank — an administrator may have deleted level 3 — hence
 * the search for the smallest rank above the current level, and not a plain
 * `+ 1`.
 */
export function nextLevel(levels, token) {
    return [...levels]
        .sort((a, b) => a.level - b.level)
        .find((l) => l.level > token.level) ?? null;
}
/**
 * Reached through `client.catalogue`.
 *
 * Every method returns what the service returns, with amounts already converted
 * to `bigint` by the shared HTTP layer.
 */
export class Catalogue {
    constructor(http) {
        this.http = http;
    }
    // ── Tokens ──────────────────────────────────────────────────────────
    /**
     * The token list to SHOW, in the order KaspaRocket shows it.
     *
     * `tokens()` returns the raw catalogue, in no useful order. This one carries
     * the ranking:
     *
     *   1. sponsored promotions — paid for, to be seen
     *   2. skinned tokens — paid for too
     *   3. everything else, by 24-hour traded volume
     *
     * Within a rank, volume decides, so the order is stable between calls rather
     * than depending on insertion order.
     *
     * **Read `placement`, do not infer it from the position.** A token that is
     * both sponsored and skinned appears ONCE, at the higher rank, so counting
     * rows tells you nothing. And a paid placement that does not announce itself
     * is advertising in disguise — the field exists so your users can be told.
     *
     * ```ts
     * const { tokens } = await kr.catalogue.feed({ limit: 10 })
     * for (const t of tokens) {
     *     const badge = t.placement === "sponsored" ? " · Sponsored"
     *                 : t.placement === "skin" ? " · Featured" : ""
     *     bot.send(`$${t.ticker}${badge}`)
     * }
     * ```
     *
     * Watching for NEW tokens? Use `since`, not paging
     * ------------------------------------------------
     * The ranking above is the wrong tool for it, and the failure is silent: a
     * token minted a minute ago has no 24-hour volume, so it lands at the
     * BOTTOM of rank 3, among every other zero-volume token. Measured
     * 2026-09-22 on the live catalogue — of thirty tokens, positions 9 to 30
     * were all at zero volume. Read the first twenty and a launch can be
     * missed entirely; on a catalogue of hundreds it will be missed nearly
     * every time. Raising `limit` only moves the cliff.
     *
     * `since` returns what was created after an instant, OLDEST FIRST, with the
     * cursor for the next call. Oldest first is the point: newest-first plus a
     * limit drops the oldest unseen rows — precisely the ones not yet handled.
     *
     * ```ts
     * let since = new Date(Date.now() - 3600_000).toISOString()
     * for (;;) {
     *     const page = await kr.catalogue.feed({ since, limit: 50 })
     *     for (const t of page.tokens) await snipe(t)
     *     // `next_since` is null when nothing new came back — keep the old one.
     *     since = page.next_since ?? since
     *     await sleep(5_000)
     * }
     * ```
     *
     * The bound is EXCLUSIVE, so a token is never delivered twice. Keep looping
     * while `pagination.total_count` exceeds what you have read: that is how
     * you catch up after a burst rather than losing its tail.
     *
     * The two modes are not interchangeable
     * --------------------------------------
     * Cursor mode changes the ORDER, not the rows: every token still carries
     * `placement`, `placement_ends_at` and `skin_id`. But it is chronological,
     * so a sponsored token is NOT hoisted — it arrives when it was minted,
     * like any other.
     *
     * So if your bot shows users a list, call `feed()` without `since` for
     * that list, and keep `since` for detection. A bot that reads only the
     * cursor will surface paid placements no better than chance, and those
     * placements are what a creator paid for. Two calls, two purposes.
     */
    async feed(options = {}) {
        const since = options.since instanceof Date
            ? options.since.toISOString()
            : options.since;
        return this.http.get("/api/tokens/feed", {
            limit: options.limit,
            page: options.page,
            since,
        });
    }
    /**
     * The whole catalogue, as a flat array.
     *
     * NOT paginated, despite the options below: the route accepts them and
     * currently ignores them, returning everything. They are passed through so
     * that the day the server honours them, callers need no change — but do not
     * rely on `limit` to bound the response today.
     */
    async tokens(options = {}) {
        return this.http.get("/api/tokens", {
            page: options.page,
            limit: options.limit,
            sort: options.sort,
        });
    }
    /** One specific token. Returns the DETAIL shape — see `TokenRecord`. */
    async token(tokenId) {
        return this.http.get(`/api/tokens/${encodeURIComponent(tokenId)}`);
    }
    /**
     * A token's covenants — and the only way to obtain its `lp_amm_covenant_id`.
     *
     * `quote`, `route`, `planTrade`, `planSwap`, `poolStats` and `candles` all
     * require that value, and neither token route returns it. Without this
     * method an integrator simply cannot trade; it is not a convenience.
     *
     * Prefer `poolCovenant()` unless you need the raw list.
     */
    async covenants(tokenId) {
        return this.http.get(`/api/covenants/by-token/${encodeURIComponent(tokenId)}`);
    }
    /**
     * The pool covenant of a token, or `null` if it has none yet.
     *
     * ```ts
     * const pool = await kr.catalogue.poolCovenant(tokenId)
     * if (!pool) throw new Error("this token has no pool")
     * await kr.quote({ tokenId, lpCovenantId: pool.lp_amm_covenant_id, ... })
     * ```
     *
     * `null` rather than a throw: a token created seconds ago legitimately has
     * no pool yet, and that is not an error condition for a caller listing the
     * catalogue.
     */
    async poolCovenant(tokenId) {
        const all = await this.covenants(tokenId);
        return all.find((c) => c.utxo_type === "amm" && c.lp_amm_covenant_id) ?? null;
    }
    /**
     * The home page sections — trending, recent, close to graduating. One
     * request rather than three.
     */
    async sections() {
        return this.http.get("/api/tokens/sections");
    }
    async search(query) {
        return this.http.get("/api/tokens/search", { q: query });
    }
    async tokensByCreator(address) {
        return this.http.get(`/api/tokens/creator/${encodeURIComponent(address)}`);
    }
    async collections() {
        return this.http.get("/api/tokens/collections");
    }
    async collectionByToken(tokenId) {
        return this.http.get(`/api/tokens/collections/by-token/${encodeURIComponent(tokenId)}`);
    }
    // ── Likes ───────────────────────────────────────────────────────────
    async likes(tokenId, address) {
        return this.http.get(`/api/tokens/${encodeURIComponent(tokenId)}/like`, {
            kaspa_address: address,
        });
    }
    /** Toggles the like. Requires `catalogue:write`. */
    async toggleLike(tokenId, address) {
        return this.http.post(`/api/tokens/${encodeURIComponent(tokenId)}/like`, {
            kaspa_address: address,
        });
    }
    // ── Comments ────────────────────────────────────────────────────────
    async comments(tokenId, page = 1) {
        return this.http.get(`/api/comments/${encodeURIComponent(tokenId)}`, { page });
    }
    /** Requires `catalogue:write`. */
    async postComment(params) {
        return this.http.post("/api/comments", {
            token_id: params.tokenId,
            kaspa_address: params.address,
            content: params.content,
        });
    }
    // ── Activity and statistics ─────────────────────────────────────────
    async activity(address, options = {}) {
        return this.http.get(`/api/activity/${encodeURIComponent(address)}`, {
            page: options.page,
            limit: options.limit,
        });
    }
    async activityStats(address) {
        return this.http.get(`/api/activity/${encodeURIComponent(address)}/stats`);
    }
    async analytics(options = {}) {
        return this.http.get("/api/analytics", {
            page: options.page ?? 1,
            limit: options.limit ?? 100,
        });
    }
    /** Platform-wide statistics. */
    async platformStats() {
        return this.http.get("/api/stat_dapp");
    }
    /**
     * The championship: the levels, and where each token stands.
     *
     * One call returns both, because a cell of the ranking is an "X out of Y"
     * whose Y comes from the levels: separating them would mean waiting for two
     * responses to display one row.
     *
     * Censored tokens are excluded. It is not paginated — this is a ranking, and
     * reading it in slices assumes an ordering between two requests that the
     * recomputation does not guarantee.
     */
    async championship() {
        return this.http.get("/api/championship");
    }
    /**
     * One token's rank, and the ladder that goes with it.
     *
     * Prefer this to `championship()` when displaying a single token: the full
     * list carries every token and every counter, which is a lot for one badge.
     *
     * `token` is `null` when the token exists but has not been computed yet.
     * That is DIFFERENT from level 0, which means computed and unranked — a
     * display that conflates the two announces "level 0" for a token nothing is
     * known about yet.
     */
    async championshipToken(tokenId) {
        return this.http.get(`/api/championship/${encodeURIComponent(tokenId)}`);
    }
    /**
     * An account's transaction history, as the indexer sees it.
     *
     * Distinct from `activity()`: that one recounts what the address DID on
     * KaspaRocket (buys, sells, orders), this one lists the raw transactions
     * attached to the account. Both exist because they answer two different
     * questions, and folding one into the other would force the caller to filter
     * out what they did not want.
     */
    async transactions(accountId) {
        return this.http.get(`/api/transactions/${encodeURIComponent(accountId)}`);
    }
    // ── Skins and promotions ────────────────────────────────────────────
    async activeSkins() {
        return this.http.get("/api/skins/active");
    }
    async skinPricing(tokenId) {
        return this.http.get("/api/skins/pricing", { token_id: tokenId });
    }
    /**
     * Buys a skin. Requires `catalogue:write`.
     *
     * `transactionId` is the proof of payment: the server refuses a purchase no
     * transaction funds, and the uniqueness constraint in the database stops the
     * same one being replayed twice.
     */
    async buySkin(params) {
        return this.http.post("/api/skins", {
            token_id: params.tokenId,
            kaspa_address: params.address,
            skin_id: params.skinId,
            duration_minutes: params.durationMinutes,
            price_paid_kas: params.pricePaidKas,
            transaction_id: params.transactionId,
        });
    }
    async activeAds() {
        return this.http.get("/api/ads/active");
    }
    async adPricing(tokenId) {
        return this.http.get("/api/ads/pricing", { token_id: tokenId });
    }
    /** Buys a promotion. Requires `catalogue:write`. */
    async buyAd(params) {
        return this.http.post("/api/ads", {
            token_id: params.tokenId,
            kaspa_address: params.address,
            duration_minutes: params.durationMinutes,
            price_paid_kas: params.pricePaidKas,
            transaction_id: params.transactionId,
        });
    }
}
//# sourceMappingURL=catalogue.js.map