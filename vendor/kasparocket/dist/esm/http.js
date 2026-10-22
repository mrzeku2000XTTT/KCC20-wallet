/**
 * HTTP layer: one place for authentication, errors, retries and amount
 * conversion.
 *
 * The u64 problem
 * ---------------
 * Kaspa counts in 64-bit sompi. `JSON.parse` produces `number`s, hence doubles:
 * past 2^53 the low units vanish, with no exception and no warning. The service
 * therefore sends those fields as STRINGS.
 *
 * Converting "every string that looks like a number" would be simpler and wrong:
 * an `order_id` is a 64-character hex string, sometimes entirely numeric, and
 * turning it into a `bigint` destroys it. Conversion is therefore driven by the
 * field NAME — the same list as `_U64_FIELDS` on the server, plus the fields
 * specific to this SDK.
 */
import { KaspaRocketError, kindFromStatus } from "./errors.js";
/**
 * Fields whose value is a 64-bit amount.
 *
 * Kept in step with `_U64_FIELDS` in `wallet/tx_api.py`. A divergence breaks
 * nothing loudly: the field stays a string and the integrator's arithmetic fails
 * further along on a `string + bigint`. That is why the SDK tests check this
 * list against a real response rather than assuming it correct.
 */
const U64_FIELDS = new Set([
    "amount", "value", "lockTime", "gas", "blockDaaScore", "mass", "storageMass",
    "sequence",
    "kasFlowSompi", "kas_flow_sompi", "platformFeeSompi", "platform_fee_sompi",
    "partnerFeeSompi", "partner_fee_sompi", "totalPlatformFeeSompi", "total_fee_sompi",
    "feeSompi", "fee_sompi", "kasSompi", "kas_sompi", "priceSompi", "price_sompi",
    "kasExecutedSompi", "kas_executed_sompi", "budget_sompi", "limit_price_sompi",
    "amountTokens", "amount_tokens", "tokens", "tokensRemaining", "tokens_remaining",
    "reserveTokens", "reserve_tokens", "reserveKasSompi", "reserve_kas_sompi",
    "spotBeforeSompi", "spot_before_sompi", "spotAfterSompi", "spot_after_sompi",
    "treasuryMinSompi", "partnerMinSompi", "treasurySompi", "partnerSompi", "totalSompi",
    "kasPaidSompi", "kas_paid_sompi", "kasReceivedSompi", "kas_received_sompi",
    // Peut etre NEGATIF — une vente sous le plancher de frais coute plus
    // qu'elle ne rapporte. `parseAmounts` accepte le signe.
    "net_kas_sompi", "netKasSompi", "minOrderValueSompi", "min_order_value_sompi",
    // L'echelle des jetons, publiee par /protocol. Ce ne sont pas des montants
    // mais des facteurs, et ils comptent quand meme ici : `ProtocolInfo` les
    // declare `bigint` pour qu'ils se multiplient avec des montants sans
    // « Cannot mix BigInt and other types ». Absents de cette liste, ils
    // arriveraient en `number` sous un type qui promet un `bigint`.
    "rawPerToken", "raw_per_token", "rawTotalSupply", "raw_total_supply",
    "fillAmount", "fill_amount", "creatorRefundSompi", "fillerTokenChange",
    "lock_amount_sompi", "vaultAfter", "volumeSompi", "volume_sompi",
    // Token creation (bot): deposit, platform share, partner share.
    "amount_to_send_sompi", "required_deposit_sompi", "balance_sompi",
    "swept_sompi",
]);
/**
 * Fields that are a u64 ONLY when the server quotes them.
 *
 * `price_sompi` is exact on an order — it is a contract parameter — and a
 * floating rate on a pool, where it is a division. The server marks the
 * difference the way JSON allows: a string for the first, a bare number for the
 * second. Honouring that is the only way name-driven conversion can be right
 * for a name that carries two meanings.
 */
const STRING_ONLY_U64 = new Set(["priceSompi", "price_sompi"]);
/**
 * Copies `node`, converting amount fields to `bigint`.
 *
 * `tx` is left INTACT: it is the package destined for the signer and the node.
 * Replacing strings with `bigint`s inside it would break `JSON.stringify` on the
 * way back out — `bigint` is not serialisable — and the transaction would never
 * be sent.
 */
export function parseAmounts(node, key) {
    if (key === "tx")
        return node;
    if (Array.isArray(node))
        return node.map((v) => parseAmounts(v, key));
    if (node !== null && typeof node === "object") {
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            out[k] = parseAmounts(v, k);
        }
        return out;
    }
    if (typeof node === "string" && key !== undefined && U64_FIELDS.has(key)) {
        // An empty or non-decimal string is not an amount: leaving it as-is
        // beats returning 0n, which would slip by unnoticed.
        if (/^-?\d+$/.test(node))
            return BigInt(node);
        return node;
    }
    if (typeof node === "number" && key !== undefined && U64_FIELDS.has(key)) {
        // Ces noms-la designent DEUX choses selon la route, et seul le guillemet
        // les distingue :
        //
        //     /book            "price_sompi": "23000"        u64 exact d'un ordre
        //     /tokens/{addr}   "price_sompi": 24582.79…      un TAUX, prix au comptant
        //     /pool/stats      "price_sompi": 24582.0        le meme taux, entier par hasard
        //
        // Le dernier cas est celui qui mordait : `Number.isInteger(24582.0)` vaut
        // vrai, donc le taux devenait un `bigint` — mais seulement quand le
        // marche tombait juste. Le meme champ, la meme route, deux types selon
        // le cours du jour, et un « Cannot mix BigInt and other types » chez
        // l'appelant qui multipliait par un solde.
        //
        // Le serveur a deja tranche pour nous : un u64 voyage entre guillemets.
        // Un nombre nu n'en est pas un, et on ne le convertit pas.
        if (STRING_ONLY_U64.has(key))
            return node;
        // An INTEGER converts: the server should send a string, but if it sends
        // a number, that number fits in a double anyway.
        //
        // A FLOAT passes THROUGH untouched, and this line has a history. It used
        // to throw, on the grounds that a fractional sompi amount signals
        // precision already lost. The reasoning was right, the sanction was not:
        // a single unexpected field destroyed the WHOLE response. Candlesticks
        // are the example — the server deliberately sends `open`/`high`/`low`/
        // `close` as floats there, and the chart broke outright.
        //
        // The real protection against precision loss is the server's contract:
        // u64s travel as strings. The SDK cannot reconstruct that by refusing
        // data, only break what was working.
        return Number.isInteger(node) ? BigInt(node) : node;
    }
    return node;
}
/**
 * The inverse of `parseAmounts`: returns a JSON-serialisable value.
 *
 * Why this is necessary, not merely convenient
 * ---------------------------------------------
 * `JSON.stringify` THROWS on a `bigint` — "Do not know how to serialize a
 * BigInt". This is not a rare case: logging a quote, caching it in Redis,
 * returning it from a webhook, writing it to a state file — a bot does all of
 * that constantly, and every one of those crashes on an object from the SDK.
 *
 * Amounts come out as STRINGS, not `number`s: converting them back to floats
 * would reintroduce exactly the precision loss `bigint` exists to prevent. A
 * string reads back with `BigInt(...)` losslessly.
 *
 *     await redis.set(key, JSON.stringify(toJsonSafe(quote)))
 *     bot.sendMessage(id, JSON.stringify(toJsonSafe(plan.summary), null, 2))
 */
export function toJsonSafe(value) {
    if (typeof value === "bigint")
        return value.toString();
    if (Array.isArray(value))
        return value.map(toJsonSafe);
    if (value !== null && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = toJsonSafe(v);
        }
        return out;
    }
    return value;
}
/**
 * A READABLE message, whatever shape the error body takes.
 *
 * FastAPI does not always return `detail` as text. A 422 validation error
 * returns an ARRAY of `{loc, msg, type}` objects, and an `HTTPException` may
 * carry a dictionary. Handling only strings made those messages DISAPPEAR: the
 * caller got "422 on /plan/trade" with no offending field, even though the
 * server had named it.
 *
 * A validation error is flattened into one sentence — "tokens: input should be a
 * valid integer" — rather than dumped as raw JSON, which teaches nothing more
 * and displays nowhere.
 */
function readableDetail(value) {
    if (typeof value === "string")
        return value;
    if (value === null || value === undefined)
        return "";
    if (Array.isArray(value)) {
        return value.map(readableDetail).filter(Boolean).join(" · ");
    }
    if (typeof value === "object") {
        const o = value;
        if (typeof o["msg"] === "string") {
            const field = Array.isArray(o["loc"])
                ? o["loc"].filter((x) => x !== "body").join(".")
                : "";
            return field ? `${field}: ${o["msg"]}` : o["msg"];
        }
        try {
            return JSON.stringify(value);
        }
        catch {
            return "";
        }
    }
    return String(value);
}
/** Wait between attempts: exponential, bounded, with a little noise. */
function retryDelay(attempt, suggested) {
    if (suggested !== undefined && suggested > 0)
        return Math.min(suggested, 30000);
    const base = Math.min(250 * 2 ** attempt, 4000);
    // The noise stops N clients that backed off together from returning
    // together and reproducing the overload they just suffered.
    return base + Math.floor(Math.random() * 250);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class Http {
    constructor(opts) {
        this.opts = opts;
    }
    async get(path, params) {
        const query = new URLSearchParams(Object.entries(params ?? {})
            .filter((e) => e[1] !== undefined)
            .map(([k, v]) => [k, String(v)])).toString();
        // A params object whose values are all `undefined` yields NO query
        // string, not a bare "?". Every optional-parameter call passes such an
        // object, and a dangling "?" is a different URL to a cache and a
        // different line in a log for a request that is in fact the plain one.
        return this.send("GET", query ? `${path}?${query}` : path, undefined);
    }
    /**
     * `noRetry` disables automatic retries for THIS call.
     *
     * Reserved for `/submit`. Replaying a build is harmless — it only reads UTXOs
     * and assembles an unsigned transaction — but replaying a BROADCAST resends
     * an already-broadcast transaction, and the node then answers with a
     * duplicate error that nothing distinguishes from a real failure.
     */
    async post(path, body, opts = {}) {
        return this.send("POST", path, body, opts.noRetry === true);
    }
    /**
     * POST returning the raw response body, for a stream.
     *
     * Outside `send` on purpose: that path buffers the whole body and parses it
     * as JSON, which for a Server-Sent Events stream would mean waiting for the
     * deployment to finish before reporting its first step — the opposite of
     * what a progress stream is for.
     *
     * No retries either. Replaying a token deployment would deploy it twice.
     */
    async stream(path, body, signal) {
        const url = this.opts.baseUrl + path;
        let response;
        try {
            response = await this.opts.fetch(url, {
                method: "POST",
                headers: { ...this.headers(body !== undefined), accept: "text/event-stream" },
                ...(body === undefined
                    ? {}
                    : { body: JSON.stringify(toJsonSafe(body)) }),
                // No timeout here, unlike the other calls: a deployment runs for
                // minutes, and cutting it off after thirty seconds would not stop
                // the server — it carries on in the background — it would only
                // deprive the caller of the end of the story.
                ...(signal ? { signal } : {}),
            });
        }
        catch (cause) {
            throw new KaspaRocketError("network", `${path} unreachable`, {
                endpoint: path,
                cause,
            });
        }
        if (!response.ok)
            throw await this.toError(response, path);
        if (!response.body) {
            throw new KaspaRocketError("network", `${path} returned no body to stream. A proxy along the way is ` +
                `probably buffering the response.`, { endpoint: path, status: response.status });
        }
        return response.body;
    }
    headers(withBody) {
        const h = { accept: "application/json" };
        if (withBody)
            h["content-type"] = "application/json";
        // `Authorization: Bearer` is the standard form. The server also accepts
        // `x-kr-api-key` for clients whose gateway eats `Authorization`; the SDK
        // only ever emits the first.
        if (this.opts.apiKey)
            h["authorization"] = `Bearer ${this.opts.apiKey}`;
        if (this.opts.userAgent)
            h["user-agent"] = this.opts.userAgent;
        return h;
    }
    async send(method, path, body, noRetry = false) {
        const url = this.opts.baseUrl + path;
        const cap = noRetry ? 0 : this.opts.maxRetries;
        let last;
        for (let attempt = 0; attempt <= cap; attempt++) {
            const abort = new AbortController();
            const timer = setTimeout(() => abort.abort(), this.opts.timeoutMs);
            try {
                const response = await this.opts.fetch(url, {
                    method,
                    headers: this.headers(body !== undefined),
                    // Omitted rather than set to `undefined`: under
                    // exactOptionalPropertyTypes, `body: undefined` is not the
                    // same thing as an absent body.
                    //
                    // `toJsonSafe` before serialising, and this is not
                    // defensive: the SDK returns `bigint`s, so anything a caller
                    // hands BACK to us contains them. The anti-sandwich
                    // commitment is the example — it is a slice produced by
                    // `route()`, passed straight back to `planTrade()`, and
                    // `JSON.stringify` threw on it. An integrator would have hit
                    // the same thing on their very first buy.
                    //
                    // The server expects its u64s as strings anyway, so the
                    // round-trip is exact: it gets back what it sent.
                    ...(body === undefined
                        ? {}
                        : { body: JSON.stringify(toJsonSafe(body)) }),
                    signal: abort.signal,
                });
                if (response.ok) {
                    const text = await response.text();
                    if (!text)
                        return undefined;
                    try {
                        const raw = JSON.parse(text);
                        return (this.opts.convertAmounts === false
                            ? raw
                            : parseAmounts(raw));
                    }
                    catch (cause) {
                        throw new KaspaRocketError("network", `unreadable response from ${path}: it was not JSON.`, { endpoint: path, status: response.status, cause });
                    }
                }
                last = await this.toError(response, path);
            }
            catch (cause) {
                if (cause instanceof KaspaRocketError) {
                    last = cause;
                }
                else {
                    const aborted = cause instanceof Error && cause.name === "AbortError";
                    last = new KaspaRocketError("network", aborted
                        ? `${path} did not answer within ${this.opts.timeoutMs} ms.`
                        : `${path} unreachable: ${cause?.message ?? cause}`, { endpoint: path, cause });
                }
            }
            finally {
                clearTimeout(timer);
            }
            // Replaying a /plan/* call is harmless: it reads UTXOs and assembles
            // an unsigned transaction, nothing goes out on the network. /submit
            // passes `noRetry`, so `cap` is zero there.
            if (!last.retryable || attempt === cap)
                break;
            await sleep(retryDelay(attempt, last.retryAfterMs));
        }
        throw last ?? new KaspaRocketError("unknown", `${path} failed`);
    }
    async toError(response, path) {
        let detail;
        let message = `${response.status} on ${path}`;
        try {
            const text = await response.text();
            if (text) {
                try {
                    detail = JSON.parse(text);
                    const d = detail;
                    const readable = readableDetail(d?.detail ?? d?.error);
                    if (readable)
                        message = readable;
                }
                catch {
                    detail = text;
                    message = text.slice(0, 400);
                }
            }
        }
        catch {
            /* unreadable body: the status is enough */
        }
        const after = response.headers?.get?.("retry-after");
        const retryAfterMs = after && /^\d+$/.test(after) ? Number(after) * 1000 : undefined;
        return new KaspaRocketError(kindFromStatus(response.status), message, {
            status: response.status,
            endpoint: path,
            details: detail,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        });
    }
}
//# sourceMappingURL=http.js.map