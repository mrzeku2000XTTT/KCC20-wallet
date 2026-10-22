/**
 * @kasparocket/sdk — the official KaspaRocket SDK.
 *
 * Quotes, swaps, limit orders and market data on Kaspa. This package holds,
 * derives and reads NO private key: it builds unsigned transactions, and you
 * sign them.
 *
 *     import { KaspaRocket } from "@kasparocket/sdk"
 *
 *     const kr = new KaspaRocket({ apiKey: process.env.KR_API_KEY })
 *     const quote = await kr.quote({ tokenId, lpCovenantId, direction: "buy",
 *                                    kasBudgetSompi: 100n * 100_000_000n })
 *     const plan  = await kr.planTrade({ ... })
 *     await kr.signAndSubmit(plan, mySigner)
 *
 * Without an `apiKey` everything works: you are simply not identified as a
 * partner, and no share of the fee comes back to you.
 */
export { KaspaRocket } from "./client.js";
export { Catalogue, nextLevel, soldDurations } from "./catalogue.js";
export { KaspaRocketError, kindFromStatus } from "./errors.js";
export { FALLBACK_FEES, computeFees, feesAreAuthoritative, formatKas, kasToSompi, 
// Token amounts convert like KAS amounts, and for the same reason: a raw
// unit is to a token what a sompi is to a KAS.
RAW_PER_TOKEN, RAW_TOTAL_SUPPLY, TOKEN_DECIMALS, formatTokens, tokenPriceSompi, tokensToRaw, } from "./protocol.js";
export { Tokens } from "./tokens.js";
export { instructionsToSign, isAlreadyComplete, scriptP2pkh, spliceCovenantSignature, } from "./signer.js";
export { parseAmounts, toJsonSafe } from "./http.js";
export { MAX_PAYMENT_OUTPUTS, PAYOUT_MASS_BUDGET, splitPayout, storageMass, } from "./payout.js";
export { SOMPI_PER_KAS, expectedSignatures } from "./types.js";
//# sourceMappingURL=index.js.map