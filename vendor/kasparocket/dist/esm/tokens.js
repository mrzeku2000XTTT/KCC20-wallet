/**
 * The wire shape into `TokenResult`.
 *
 * The wire is snake_case and this type is not, so the two paths that used to
 * hand the raw object back — `session()` and `run()` — were promising fields
 * that did not exist: `depositAddress`, `requiredDepositKas` and
 * `partner.feeSompi` all read `undefined` at runtime while TypeScript called
 * them `string`, `number` and `bigint`. `createSession()` mapped by hand and
 * was fine, which is exactly how the gap survived. One mapper now, for all
 * three.
 */
function versResultat(brut) {
    const r = (brut["result"] ?? null);
    const chaine = (v) => typeof v === "string" && v.length > 0 ? v : null;
    const p = brut["partner"];
    const grand = (v) => {
        if (typeof v === "bigint")
            return v;
        if (typeof v === "string" && /^\d+$/.test(v))
            return BigInt(v);
        if (typeof v === "number" && Number.isInteger(v))
            return BigInt(v);
        return 0n;
    };
    return {
        status: brut["status"],
        error: brut["error"] ?? null,
        depositAddress: String(brut["deposit_address"] ?? ""),
        requiredDepositKas: Number(brut["required_deposit_kas"] ?? 0),
        partner: p
            ? { slug: String(p["slug"]), feeSompi: grand(p["fee_sompi"]) }
            : null,
        steps: brut["steps"] ?? [],
        tokenId: chaine(r?.["real_covenant_id"]),
        lpCovenantId: chaine(r?.["real_lp_covenant_id"]),
        result: r,
    };
}
/**
 * Reached through `client.tokens`.
 *
 * The bot lives behind its own path (`/api/bot`), which is why this takes a
 * separate `Http`. Same key, same partner identity — a partner does not have
 * two identities depending on which door they push.
 */
export class Tokens {
    constructor(http) {
        this.http = http;
    }
    /**
     * Opens a creation session and returns the deposit address.
     *
     * Nothing is deployed yet and nothing is charged. A session the user never
     * funds simply expires — it costs neither of you anything, and it will not
     * appear in your statement.
     */
    async createSession(params) {
        const r = await this.http.post("/api/bot/api/session", {
            user_address: params.creatorAddress,
            token_name: params.name,
            token_tick: params.ticker,
            description: params.description,
            image_url: params.imageUrl,
            website_url: params.websiteUrl,
            x_url: params.xUrl,
            telegram_url: params.telegramUrl,
        });
        const big = (k) => {
            const v = r[k];
            if (typeof v === "bigint")
                return v;
            if (typeof v === "string" && /^\d+$/.test(v))
                return BigInt(v);
            if (typeof v === "number" && Number.isInteger(v))
                return BigInt(v);
            return 0n;
        };
        return {
            sessionId: String(r["session_id"]),
            depositAddress: String(r["deposit_address"]),
            amountSompi: big("amount_to_send_sompi"),
            platformFeeSompi: big("platform_fee_sompi"),
            partnerFeeSompi: big("partner_fee_sompi"),
            network: String(r["network"]),
            creatorAddress: r["creator_address"] ?? null,
            steps: (r["state"]?.steps) ?? [],
        };
    }
    /** Current state of a session. Safe to poll. */
    async session(sessionId) {
        return versResultat(await this.http.get(`/api/bot/api/session/${encodeURIComponent(sessionId)}`));
    }
    /**
     * How much has landed on the deposit address so far.
     *
     * `paid` compares against THIS session's requirement, your share included —
     * not the base deposit. Comparing against the base would call a session
     * funded and leave nothing for your cut at sweep time.
     */
    async depositBalance(sessionId) {
        return this.http.get(`/api/bot/api/session/${encodeURIComponent(sessionId)}/balance`);
    }
    /**
     * Runs the deployment, reporting each step as it happens.
     *
     * Call this once the deposit has landed. The server streams progress over
     * Server-Sent Events; `onProgress` is invoked per event.
     *
     * **The flow does not stop if you stop listening.** The server runs it to
     * completion in the background — a deployment is never cut in the middle of
     * a transaction. If your process dies, poll `session()` to find out where it
     * got to; do not call `run` again, or you will pay for a second deployment.
     */
    async run(sessionId, onProgress, signal) {
        // ```ts
        // const done = await kr.tokens.run(sessionId)
        // if (done.status !== "completed") throw new Error(done.error ?? "failed")
        // await kr.quote({ tokenId: done.tokenId!, lpCovenantId: done.lpCovenantId!, … })
        // ```
        const body = await this.http.stream(`/api/bot/api/session/${encodeURIComponent(sessionId)}/run`, undefined, signal);
        let last = null;
        for await (const event of readSse(body)) {
            onProgress?.(event);
            if (event.type === "done")
                last = event;
        }
        // The stream may end without a `done` frame — a proxy timing out, a
        // connection dropped. Asking the server is the only reliable way to
        // know the outcome, and it is cheap.
        // Le cadre `done` est `{type:"done", ...session.to_dict()}` : la meme
        // forme de fil que `session()`, donc le meme convertisseur. Le rendre
        // tel quel laissait `tokenId` absent sur le chemin le plus utilise —
        // celui ou l'on vient justement de creer le jeton.
        if (last)
            return versResultat(last);
        return this.session(sessionId);
    }
}
/**
 * Parses a Server-Sent Events stream into objects.
 *
 * Written by hand rather than pulled from a dependency: `EventSource` does not
 * exist in Node and cannot carry an `Authorization` header in the browser
 * either, which rules it out on both sides. The wire format we need is one
 * field — `data:` — so a full SSE library would be forty kilobytes to ignore
 * thirty-nine of them.
 *
 * Frames are separated by a blank line, and a frame can span several chunks —
 * hence the buffer. Splitting on chunk boundaries instead would truncate JSON
 * at random, and only under load.
 */
async function* readSse(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let split;
            while ((split = buffer.indexOf("\n\n")) !== -1) {
                const frame = buffer.slice(0, split);
                buffer = buffer.slice(split + 2);
                for (const line of frame.split("\n")) {
                    // `:` alone is a heartbeat; the server sends them so proxies
                    // do not buffer or time out the stream.
                    if (!line.startsWith("data:"))
                        continue;
                    const payload = line.slice(5).trim();
                    if (!payload)
                        continue;
                    try {
                        yield JSON.parse(payload);
                    }
                    catch {
                        // A malformed frame is not worth killing a deployment
                        // that is already running on the server.
                    }
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
//# sourceMappingURL=tokens.js.map