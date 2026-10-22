/**
 * The signing interface — the boundary this SDK does not cross.
 *
 * This SDK holds no key, derives none, reads none. It builds UNSIGNED
 * transactions and hands them back as-is. You sign them, with whatever you
 * like: a browser extension, a hardware wallet, your own signer, a custody
 * service.
 *
 * Why the separation, rather than a built-in signer
 * --------------------------------------------------
 * An SDK that signs is an SDK that must receive a private key. That would force
 * every integrator to route their users' secrets through code they did not
 * write, and force us to answer for it. The boundary is therefore drawn here,
 * in the type, rather than in a recommendation you can ignore.
 *
 * What a signer MUST respect
 * ---------------------------
 * Each input carries an instruction, and there are THREE kinds:
 *
 *   `final`            do nothing, write nothing.
 *   `p2pkh`            write a fresh script — `scriptP2pkh`.
 *   `covenant-leader`  splice the signature into the prebuilt script, at the
 *                      offsets given — `spliceCovenantSignature`.
 *
 * The trap is `covenant-leader`. It looks like a covenant input, so it is
 * tempting to leave it alone; it nonetheless requires a signature. A signer
 * that only handles `p2pkh` leaves the input empty and the node rejects the
 * transaction with "script ran, but verification failed" — without saying which
 * input. This is the case for every ORDER FILL: the vault of the order being
 * filled is a `covenant-leader` input.
 *
 * Each input's `computeBudget` field must be COPIED THROUGH untouched. It is
 * not part of the sighash, but the node refuses the transaction without it.
 */
import { KaspaRocketError } from "./errors.js";
/** A BIP-340 signature (64 bytes) followed by the sighash type byte. */
const SIGNATURE_LENGTH = 65;
/**
 * The instructions that REQUIRE a signature — `p2pkh` and `covenant-leader`.
 *
 * Returns whole instructions rather than indices: handling differs by kind, and
 * `sigscript` / `sigOffsets` are needed for the second case. A list of indices
 * invites the uniform loop that destroys prebuilt scripts.
 */
export function instructionsToSign(planned) {
    return planned.signingInstructions.filter((i) => i.kind !== "final");
}
/**
 * True if this transaction requires NO signature at all.
 *
 * The case exists: a transaction made entirely of `final` inputs is complete as
 * built. Rare in practice — the user almost always brings KAS — but a signer
 * that assumes "at least one signature" spins on it.
 */
export function isAlreadyComplete(planned) {
    return planned.signingInstructions.every((i) => i.kind === "final");
}
/**
 * The sigscript of a `p2pkh` input: `OP_DATA_65 || signature`.
 *
 * `signature` is the RAW 65-byte signature — 64 bytes of BIP-340 followed by the
 * sighash type byte — not the pre-encoded form some libraries return. An
 * unexpected length is refused here rather than ending in a node rejection with
 * no diagnostic.
 */
export function scriptP2pkh(signature) {
    return `41${toHex(toBytes(signature, "scriptP2pkh"))}`;
}
/**
 * Splices the signature into the prebuilt sigscript of a `covenant-leader` input.
 *
 * The server left 65-byte ZERO placeholders, one per entry in `sigOffsets`. This
 * function checks each placeholder really is zeroed before writing: a non-zero
 * placeholder means the script is not the one the offsets were computed for, and
 * signing it anyway would authorise a script nobody inspected.
 *
 * Returns the complete sigscript, to set on the input as-is.
 */
export function spliceCovenantSignature(instruction, signature) {
    if (instruction.kind !== "covenant-leader") {
        throw new KaspaRocketError("invalid_request", `input ${instruction.inputIndex} is of kind "${instruction.kind}", not ` +
            `"covenant-leader": ` +
            (instruction.kind === "final"
                ? "it is already complete, write nothing to it."
                : "use `scriptP2pkh`."));
    }
    if (!instruction.sigscript) {
        throw new KaspaRocketError("invalid_request", `input ${instruction.inputIndex} is "covenant-leader" but carries no prebuilt ` +
            `sigscript. The plan is inconsistent — do not sign it.`);
    }
    if (instruction.sigOffsets.length === 0) {
        throw new KaspaRocketError("invalid_request", `input ${instruction.inputIndex} is "covenant-leader" but declares no signature ` +
            `offset. The plan is inconsistent — do not sign it.`);
    }
    const raw = toBytes(signature, "spliceCovenantSignature");
    const script = toBytes(instruction.sigscript, "sigscript");
    for (const offset of instruction.sigOffsets) {
        if (offset < 0 || offset + SIGNATURE_LENGTH > script.length) {
            throw new KaspaRocketError("invalid_request", `offset ${offset} falls outside the sigscript (${script.length} bytes) of ` +
                `input ${instruction.inputIndex}.`);
        }
        for (let i = 0; i < SIGNATURE_LENGTH; i++) {
            if (script[offset + i] !== 0) {
                throw new KaspaRocketError("invalid_request", `non-zero placeholder at offset ${offset} of input ` +
                    `${instruction.inputIndex}'s sigscript — refusing to sign an ` +
                    `unexpected script.`);
            }
        }
        script.set(raw, offset);
    }
    return toHex(script);
}
function toBytes(value, where) {
    const bytes = typeof value === "string" ? fromHex(value, where) : Uint8Array.from(value);
    // The sigscript is arbitrarily long; only signatures have a fixed size.
    if (where !== "sigscript" && bytes.length !== SIGNATURE_LENGTH) {
        throw new KaspaRocketError("invalid_request", `${where}: signature of ${bytes.length} bytes, expected ${SIGNATURE_LENGTH} ` +
            `(64 bytes of BIP-340 + 1 sighash type byte).`);
    }
    return bytes;
}
function fromHex(value, where) {
    const hex = value.startsWith("0x") ? value.slice(2) : value;
    if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
        throw new KaspaRocketError("invalid_request", `${where}: invalid hex string.`);
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
function toHex(bytes) {
    let out = "";
    for (const b of bytes)
        out += b.toString(16).padStart(2, "0");
    return out;
}
//# sourceMappingURL=signer.js.map