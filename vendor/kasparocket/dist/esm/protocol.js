/**
 * FALLBACK schedule, used before the first call to `/protocol`.
 *
 * Copied from `protocol.json` at publication time, so it can go stale — which is
 * exactly why the client queries the service and replaces these values as soon
 * as it can.
 */
export const FALLBACK_FEES = {
    platformFeeRate: 0.015,
    platformFeeMinSompi: 200000000n,
    partnerTreasuryFeeRate: 0.01,
    partnerTreasuryFeeMinSompi: 200000000n,
    partnerFeeRate: 0.005,
    partnerFeeMinSompi: 100000000n,
};
/** Multiplies an integer amount by a fractional rate without going through a double. */
function rateShare(amount, rate) {
    // The rate comes from JSON (0.015, 0.01, 0.005). Carrying it as an integer
    // fraction over 6 decimals is ample, and avoids a float introducing a
    // one-sompi discrepancy against the server, which computes in integers.
    // 6 decimals cover 0.0001% of tariff granularity.
    const SCALE = 1000000n;
    const numerator = BigInt(Math.round(rate * 1000000));
    return (amount * numerator) / SCALE;
}
/**
 * Fee split for a given flow.
 *
 * Mirrors `protocol_config.platform_fee_split`. With no partner, `partner` is
 * 0n and `total === treasury`: the kasparocket.com display is unchanged.
 *
 * A one-sompi discrepancy against the server is possible and harmless: the
 * server rounds to nearest, this truncates. The amount that actually moves is
 * always the plan's, never this one.
 */
export function computeFees(kasFlowSompi, opts) {
    const p = opts.protocol;
    const schedule = p
        ? {
            treasuryRate: p.fees.treasuryRate,
            treasuryMin: p.fees.treasuryMinSompi,
            partnerRate: p.fees.partnerRate,
            partnerMin: p.fees.partnerMinSompi,
        }
        : opts.partner
            ? {
                treasuryRate: FALLBACK_FEES.partnerTreasuryFeeRate,
                treasuryMin: FALLBACK_FEES.partnerTreasuryFeeMinSompi,
                partnerRate: FALLBACK_FEES.partnerFeeRate,
                partnerMin: FALLBACK_FEES.partnerFeeMinSompi,
            }
            : {
                treasuryRate: FALLBACK_FEES.platformFeeRate,
                treasuryMin: FALLBACK_FEES.platformFeeMinSompi,
                partnerRate: 0,
                partnerMin: 0n,
            };
    const flow = kasFlowSompi > 0n ? kasFlowSompi : 0n;
    const treasury = maxBigInt(schedule.treasuryMin, rateShare(flow, schedule.treasuryRate));
    const partner = opts.partner
        ? maxBigInt(schedule.partnerMin, rateShare(flow, schedule.partnerRate))
        : 0n;
    return { treasury, partner, total: treasury + partner };
}
function maxBigInt(a, b) {
    return a > b ? a : b;
}
/** True if the schedule came from the service, false if from the fallback values. */
export function feesAreAuthoritative(protocol) {
    return protocol != null;
}
/** Formats a sompi amount as a readable KAS quantity. */
export function formatKas(sompi, decimals = 4) {
    const SOMPI = 100000000n;
    const negative = sompi < 0n;
    const abs = negative ? -sompi : sompi;
    const whole = abs / SOMPI;
    const remainder = abs % SOMPI;
    if (decimals <= 0 || remainder === 0n)
        return `${negative ? "-" : ""}${whole}`;
    const frac = remainder.toString().padStart(8, "0").slice(0, decimals).replace(/0+$/, "");
    return frac ? `${negative ? "-" : ""}${whole}.${frac}` : `${negative ? "-" : ""}${whole}`;
}
/** Converts user input in KAS to sompi, without touching a float. */
export function kasToSompi(kas) {
    const text = typeof kas === "number" ? kas.toString() : kas.trim();
    if (!/^-?\d*(\.\d*)?$/.test(text) || text === "" || text === "." || text === "-") {
        throw new Error(`"${kas}" is not a valid KAS amount.`);
    }
    const negative = text.startsWith("-");
    const [whole = "0", frac = ""] = (negative ? text.slice(1) : text).split(".");
    // Truncate below the sompi rather than round: nobody expects an input of
    // 0.000000009 KAS to become 0.00000001.
    const sompi = BigInt(whole || "0") * 100000000n + BigInt(frac.padEnd(8, "0").slice(0, 8) || "0");
    return negative ? -sompi : sompi;
}
/* ── Token units ──────────────────────────────────────────────────────────
 *
 * A KCC20 amount travels as an INTEGER of raw units, exactly like a KAS amount
 * travels in sompi. `1000` raw units is one token, so a raw balance reads a
 * thousand times too large if you print it as-is.
 *
 * That conversion used to live in the KaspaRocket front end alone, and the
 * consequence was predictable: the first bot to hold 5,000 tokens announced
 * 5,000,000. Nothing in the payload said otherwise — a `bigint` of raw units
 * looks exactly like a `bigint` of tokens.
 *
 * So it belongs here, beside `formatKas`/`kasToSompi`, and works the same way:
 * `bigint` in, `bigint` out, a decimal string only at the very edge. No float
 * ever touches an amount.
 */
/** Decimal places a token amount is displayed with. */
export const TOKEN_DECIMALS = 3;
/**
 * Raw units in one token: `10 ** TOKEN_DECIMALS`.
 *
 * A PROTOCOL constant, not a preference. It comes from `protocol.json`
 * (`curve.raw_total_supply / curve.display_total_supply`) and the contracts are
 * compiled around it, so it cannot be changed by an integrator — nor by us,
 * without redeploying. There is deliberately no per-token `decimals` field:
 * every KCC20 on KaspaRocket uses this same scale, which is why the conversion
 * can be a constant rather than a lookup.
 */
export const RAW_PER_TOKEN = 1000n;
/** Total supply of every KCC20, in raw units. One billion → 1,000,000 tokens. */
export const RAW_TOTAL_SUPPLY = 1000000000n;
/**
 * Formats a raw token amount as a readable token quantity.
 *
 * ```ts
 * formatTokens(5_000_000n)   // "5000"
 * formatTokens(1_234_567n)   // "1234.567"
 * formatTokens(1n)           // "0.001"  — one raw unit is not nothing
 * ```
 *
 * The mirror of `formatKas`, down to trailing zeros being dropped.
 */
export function formatTokens(raw, decimals = TOKEN_DECIMALS) {
    const negative = raw < 0n;
    const abs = negative ? -raw : raw;
    const whole = abs / RAW_PER_TOKEN;
    const remainder = abs % RAW_PER_TOKEN;
    const sign = negative ? "-" : "";
    if (decimals <= 0 || remainder === 0n)
        return `${sign}${whole}`;
    const frac = remainder
        .toString()
        .padStart(TOKEN_DECIMALS, "0")
        .slice(0, decimals)
        .replace(/0+$/, "");
    return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}
/**
 * Converts user input in tokens to raw units, without touching a float.
 *
 * ```ts
 * tokensToRaw("5000")      // 5000000n
 * tokensToRaw("1.234")     // 1234n
 * tokensToRaw("0.0009")    // 0n — below one raw unit, TRUNCATED
 * ```
 *
 * Truncates below the raw unit rather than rounding, for the same reason
 * `kasToSompi` does: rounding an amount up spends money the user did not type.
 * A sell of `0.0009` tokens is a sell of nothing, and the plan will say so —
 * better than silently selling one unit.
 */
export function tokensToRaw(tokens) {
    const text = typeof tokens === "number" ? tokens.toString() : tokens.trim();
    if (!/^-?\d*(\.\d*)?$/.test(text) || text === "" || text === "." || text === "-") {
        throw new Error(`"${tokens}" is not a valid token amount.`);
    }
    const negative = text.startsWith("-");
    const [whole = "0", frac = ""] = (negative ? text.slice(1) : text).split(".");
    const raw = BigInt(whole || "0") * RAW_PER_TOKEN +
        BigInt(frac.padEnd(TOKEN_DECIMALS, "0").slice(0, TOKEN_DECIMALS) || "0");
    return negative ? -raw : raw;
}
/**
 * A price the way a human reads it: sompi for ONE token.
 *
 * Prices cross the wire as sompi per RAW unit, which is the contract's own
 * unit and is unreadable — a token worth 0.23 KAS travels as `23000`. Feed the
 * result to `formatKas` and you get the price a user recognises:
 *
 * ```ts
 * formatKas(tokenPriceSompi(23_000n))   // "0.23"
 * ```
 *
 * Kept separate from `formatTokens` on purpose: the scale applies to the price
 * in the OPPOSITE direction to an amount — multiply here, divide there. Writing
 * it out once removes the most tempting mistake in the whole conversion, which
 * is dividing a price by 1000 and getting a number a thousand times too small
 * that still looks plausible on screen.
 */
export function tokenPriceSompi(priceSompiPerRaw) {
    return priceSompiPerRaw * RAW_PER_TOKEN;
}
//# sourceMappingURL=protocol.js.map