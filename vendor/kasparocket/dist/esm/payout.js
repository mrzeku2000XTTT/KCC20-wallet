/**
 * Splitting a many-recipient payout into transactions the node will accept.
 *
 * A payout — platform fees returned to creators, or to a token's holders — is
 * a list of (address, amount). `/plan/payment` turns one list into ONE
 * transaction, which is what you want: the shares are then indivisible, and a
 * single txid says who received what. But a list has two ceilings, and neither
 * is negotiable.
 *
 * 1. The endpoint refuses more than {@link MAX_PAYMENT_OUTPUTS} outputs.
 *
 * 2. KIP-9 storage mass charges `10^12 / value` per output, and the node
 *    refuses a standard transaction above 100 000. So the cost of a batch is
 *    driven by its SMALLEST share, not by how many there are:
 *
 *        0.5 KAS  ->  20 000 each  ->  5 of them reach the ceiling
 *        4   KAS  ->   2 500 each  -> 40 of them reach the ceiling
 *       10   KAS  ->   1 000 each  -> the output count runs out first
 *
 *    Counting outputs alone would therefore build batches the node rejects,
 *    and the rejection arrives at build time with a message about mass — far
 *    from the code that chose the batch size.
 *
 * So a batch fills while BOTH hold. Nothing here decides how many transactions
 * a payout takes: the amounts do.
 *
 * The mass budget is deliberately below the real ceiling. Inputs, the change
 * output and compute mass all count too, and this module cannot see them — it
 * knows the outputs and nothing else. Leaving that margin is what makes the
 * estimate safe to act on.
 */
/**
 * The most outputs `/plan/payment` accepts in one call.
 *
 * Mirrors `PaymentPlanReq.outputs` in `wallet/tx_api.py`. The two are kept in
 * step by `wallet/tests/test_plafond_de_versement.py`: sending more than the
 * server allows fails the whole batch on a validation error, which is a poor
 * way to discover a constant.
 */
export const MAX_PAYMENT_OUTPUTS = 40;
/** KIP-9 storage mass parameter: an output of `v` sompi costs `C / v`. */
const C = 1e12;
/**
 * Storage mass a batch may reach, out of the node's 100 000 ceiling.
 *
 * The margin covers what this module cannot measure — the inputs the payer's
 * wallet will bring, the change output, compute mass. Raising it trades fewer
 * transactions for the risk of building one the node refuses.
 */
export const PAYOUT_MASS_BUDGET = 60000;
/** What one output costs in KIP-9 storage mass. */
export function storageMass(amountSompi) {
    return amountSompi > 0 ? C / amountSompi : Infinity;
}
/**
 * Split a payout into batches, each one a transaction the node should accept.
 *
 * Order is preserved: callers sort by descending share, so the small shares —
 * the expensive ones — end up together at the end rather than poisoning an
 * otherwise full batch.
 *
 * An output whose own mass already exceeds the budget still gets its own
 * batch rather than being dropped. Refusing it here would hide it; sent alone,
 * it either goes through or comes back with the node's own diagnosis.
 */
export function splitPayout(outputs, options = {}) {
    const maxOutputs = options.maxOutputs ?? MAX_PAYMENT_OUTPUTS;
    const massBudget = options.massBudget ?? PAYOUT_MASS_BUDGET;
    const batches = [];
    let current = [];
    let mass = 0;
    for (const o of outputs) {
        const m = storageMass(o.amountSompi);
        const full = current.length >= maxOutputs
            || (current.length > 0 && mass + m > massBudget);
        if (full) {
            batches.push(current);
            current = [];
            mass = 0;
        }
        current.push(o);
        mass += m;
    }
    if (current.length > 0)
        batches.push(current);
    return batches;
}
//# sourceMappingURL=payout.js.map