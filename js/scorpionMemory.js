/* Loaded into the A-Trade Agent so Scorpion knows COOK / network / sign rules. */
export const SCORPION_MEMORY = `COOK desk memory
• mainnet = KRON AMM only (kaspa:). testnet-10 = K.COM book + Scorpion launches (kaspatest:). Never quote KRON on TN10.
• Native: import 64-hex here, PIN signs, prefix follows Network. KasWare: switchNetwork to match, signPskt, keys stay in the extension.
• TTT in Profile is the dApp browser: tttz.xyz is iframed here (keys stay in this PWA). Any tttz.xyz app that loads sdk.js talks to this parent via postMessage. Connect/Sign shows the local Approve sheet — never store keys on TTT or a server.
• Cook trade: unsigned PSKT → native or KasWare → broadcast on the same net. Amount is tokens. Limit rests; empty limit takes the book. Need a wrapper marketId.
• Scorpion launched tokens with a Cook tokenId trade like K.COM (same candles, bids/asks, buy/sell).
• Compound: one output, no dust change. sendKaspa(self, total-fee) blows storage mass.
• Agent only while this tab is unlocked. Arm K.COM/Scorpion on TN10, KRON AMM on mainnet. Modes: range, dip catch, trend, curve stack, fade pump. Tape sells can print while the 1d candle stays green.
• Bet: 15m YES/NO on KRON idx. ¢ starts 50/50 and follows YES vs NO KAS. Stake locks in P2SH (agent CHECKSIG or user CLTV refund). No opponent → refund. Matched → escrow agent pays losers’ KAS to winners. Hire is KKDAG to kaspa:qrtfjh…`;
