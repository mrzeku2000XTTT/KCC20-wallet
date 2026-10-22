/**
 * The shapes the service returns, transposed into TypeScript.
 *
 * One convention runs through this whole file: **every amount is a `bigint`**.
 *
 * Kaspa amounts are u64 in sompi (1 KAS = 100,000,000 sompi). A JavaScript
 * `number` is a double: past 2^53 it silently loses units. A pool reserve of
 * 472,660,000,000 sompi still fits, a market cap does not — and the error is
 * invisible, it propagates all the way to a transaction the node rejects for a
 * reason that mentions no rounding at all.
 *
 * The service therefore sends those fields as STRINGS, and the SDK returns them
 * as `bigint`. The boundary is `parseAmounts` (http.ts): past it, no numeric
 * string circulates.
 *
 * A note on the snake_case, sometimes French, field names below
 * --------------------------------------------------------------
 * `pose_un_ordre`, `troncons`, `transactions_prevues` and friends are the JSON
 * keys the server actually sends. They are transcribed here verbatim rather than
 * translated: renaming them would mean a mapping layer, and a mapping layer is
 * one more place for a field to go missing without anything failing loudly. The
 * names this SDK owns — methods, options, helpers — are all in English.
 */
/** 1 KAS, in sompi. */
export const SOMPI_PER_KAS = 100000000n;
/**
 * How many signatures this plan will ask for, merges included.
 *
 * Written once here rather than in every caller: `transactions_prevues` on its
 * own lies to sellers whose tokens are scattered across many UTXOs.
 */
export function expectedSignatures(route) {
    return (route.consolidations_prevues ?? 0) + (route.transactions_prevues ?? 1);
}
//# sourceMappingURL=types.js.map