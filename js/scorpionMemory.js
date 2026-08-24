/* Loaded into the A-Trade Agent so Scorpion knows COOK / network / sign rules. */
export const SCORPION_MEMORY = `COOK desk memory
• mainnet = KRON AMM only (kaspa:). testnet-10 = K.COM book + Scorpion launches (kaspatest:). Never quote KRON on TN10.
• Native: import 64-hex here, PIN signs, prefix follows Network. KasWare: switchNetwork to match, signPskt, keys stay in the extension.
• External dApps detect this PWA by loading https://kcc-20-wallet.vercel.app/sdk.js (window.kcc20). Connect/sign is a popup to that origin — never inject keys, never a silent MetaMask-style probe.
• Cook trade: unsigned PSKT → native or KasWare → broadcast on the same net. Amount is tokens. Limit rests; empty limit takes the book. Need a wrapper marketId.
• Scorpion launched tokens with a Cook tokenId trade like K.COM (same candles, bids/asks, buy/sell).
• Compound: one output, no dust change. sendKaspa(self, total-fee) blows storage mass.
• Agent only while this tab is unlocked. Arm K.COM/Scorpion on TN10, KRON on mainnet.`;
