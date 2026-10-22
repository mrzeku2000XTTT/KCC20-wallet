/**
 * SDK errors — typed, so an integrator can REACT and not merely display.
 *
 * A single `Error` class carrying a message would force every caller to parse
 * that string to tell "your key is bad" from "the pool is short on liquidity" —
 * and that parsing would break on the first rewording. The code (`kind`) is
 * therefore the contract; the message is documentation.
 */
export class KaspaRocketError extends Error {
    constructor(kind, message, opts = {}) {
        super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
        this.name = "KaspaRocketError";
        this.kind = kind;
        if (opts.status !== undefined)
            this.status = opts.status;
        if (opts.endpoint !== undefined)
            this.endpoint = opts.endpoint;
        if (opts.retryAfterMs !== undefined)
            this.retryAfterMs = opts.retryAfterMs;
        if (opts.details !== undefined)
            this.details = opts.details;
    }
    /**
     * True if retrying has a chance of succeeding WITHOUT changing the request.
     *
     * `conflict` is excluded on purpose: chain state moved, so you must re-quote
     * before trying again. Retrying as-is would fail identically — or worse,
     * succeed at a price the user never approved.
     */
    get retryable() {
        return this.kind === "rate_limit" || this.kind === "unavailable" || this.kind === "network";
    }
}
/** Maps an HTTP status onto an `ErrorKind`. One place, one verdict. */
export function kindFromStatus(status) {
    if (status === 401)
        return "auth";
    if (status === 403)
        return "forbidden";
    if (status === 429)
        return "rate_limit";
    if (status === 409)
        return "conflict";
    if (status === 501)
        return "unsupported";
    if (status === 422 || status === 400 || status === 404)
        return "invalid_request";
    if (status === 503 || status === 502 || status === 504)
        return "unavailable";
    return "unknown";
}
//# sourceMappingURL=errors.js.map