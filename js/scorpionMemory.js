/* Loaded into the A-Trade Agent so Scorpion knows COOK / network / sign rules. */
export const SCORPION_MEMORY = `COOK desk memory
• mainnet = KRON AMM only (kaspa:). testnet-10 = K.COM book + Scorpion launches (kaspatest:). Never quote KRON on TN10.
• Native: import 64-hex here, PIN signs, prefix follows Network. KasWare: switchNetwork to match, signPskt, keys stay in the extension.
• TTT in Profile is the dApp browser: tttz.xyz is iframed here (keys stay in this PWA). Any tttz.xyz app that loads sdk.js talks to this parent via postMessage. Connect/Sign shows the local Approve sheet — never store keys on TTT or a server. Fund DD credits with window.kcc20.sendToken({ tick:'KKDAG', amount, dest: treasuryKaspaQ }) — this wallet builds the real KCC20 send, user Signs, TTT credits off-chain after txId. Not a fake buy. User buys KKDAG on Home/Tokens first.
• Cook trade: unsigned PSKT → native or KasWare → broadcast on the same net. Amount is tokens. Limit rests; empty limit takes the book. Need a wrapper marketId.
• Scorpion launched tokens with a Cook tokenId trade like K.COM (same candles, bids/asks, buy/sell).
• Compound: one output, no dust change. sendKaspa(self, total-fee) blows storage mass.
• Agent: pick any KRON tick (top-10 chips + type-in). Signs on this device. Keeps ticking while the PWA is unlocked in background; if the OS kills the app, reopen to resume. Never a hosted bot. Modes: range, dip catch, trend, curve stack, fade pump.
• Bet: users tap YES/NO. One market = ticker + 15m UTC window (same for every wallet). Public tape is the fee-tx payload to ax6 (no keys). ¢ is parimutuel on that shared book. Ticket id = truncated kaspa:p. Hire is KKDAG to ax6.`;
