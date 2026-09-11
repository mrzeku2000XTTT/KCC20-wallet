import { TEMPLATES, pickTemplate, silvercCmd } from "./templates.js";

const SYSTEM = `You are KBUILD, a Kaspa L1 economic builder. You write SilverScript v1.0.0 (kaspanet/silverscript official v1) covenants++.

HARD RULES:
- Output ONLY JSON: { "title": string, "summary": string, "sil": string, "ctorArgs": [{"kind":"int"|"bytes","value":string|number,"note":string}], "rules": string[] }
- sil MUST start with: pragma silverscript ^1.0.0;
- Use official v1 covenant declarations when state is needed: #[covenant.singleton], #[covenant(binding = auth|cov, from, to, mode = transition|verification)], #[covenant.delegate].
- Every onchain command is a Kaspa L1 transaction. Fee is the native Kaspa network fee in sompi. Never ETH gas. Never a platform fee.
- Never generate private keys, seeds, XMSS, or hex spending keys. Constructor args are placeholders the user fills from their own pubkey.
- Keys never leave the user's device. You only emit script source.
- Do not invent opcodes. Stick to the SilverScript tutorial + DECL.md: require, checkSig, tx.outputs, this.ageDaa, tx.time, validateOutputState via declarations, ScriptPubKeyP2PK.
- Keep contracts small and mainnet-cautious. Say what is starter vs audited.`;

const $ = (id) => document.getElementById(id);

function paintTemplates() {
  const grid = $("tpl-grid");
  if (!grid) return;
  grid.innerHTML = TEMPLATES.map((t) => `
    <button type="button" class="card" data-tpl="${t.id}">
      <em>${t.tag}</em>
      <b>${t.name}</b>
      <span>${t.blurb}</span>
    </button>
  `).join("");
  grid.querySelectorAll("[data-tpl]").forEach((btn) => {
    btn.addEventListener("click", () => showResult(TEMPLATES.find((t) => t.id === btn.dataset.tpl), "template"));
  });
}

function showResult(t, via) {
  if (!t) return;
  $("out").classList.remove("hidden");
  $("out-title").textContent = t.name || t.title || "Contract";
  $("out-via").textContent = via === "grok" ? "Drafted with Grok · SilverScript v1" : "Official v1 pattern · SilverScript v1";
  $("out-sum").textContent = t.summary || "";
  $("out-sil").value = t.sil || "";
  $("out-cmd").textContent = silvercCmd("contract.sil");
  $("out-args").value = JSON.stringify(
    (t.ctorArgs || []).map(({ kind, value }) => ({ kind, value })),
    null,
    2
  );
  $("out-rules").innerHTML = (t.rules || []).map((r) => `<li>${r}</li>`).join("");
  $("out").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function callGrok(prompt) {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.6",
      temperature: 0.2,
      max_tokens: 4096,
      jsonMode: true,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Build this Kaspa economic primitive as SilverScript v1:\n" + prompt },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || data.message || ("Grok " + res.status));
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Grok returned no content");
  const cleaned = String(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function build() {
  const prompt = $("prompt").value.trim();
  if (!prompt) return;
  $("err").textContent = "";
  $("go").disabled = true;
  $("go").textContent = "Building…";
  try {
    try {
      const drafted = await callGrok(prompt);
      showResult({
        name: drafted.title,
        summary: drafted.summary,
        sil: drafted.sil,
        ctorArgs: drafted.ctorArgs,
        rules: drafted.rules,
      }, "grok");
    } catch {
      showResult(pickTemplate(prompt), "template");
      $("err").textContent = "Grok proxy unavailable here — used a SilverScript v1 template. Run KBUILD with npm run dev (uses your signed-in Grok) for a custom draft.";
    }
  } finally {
    $("go").disabled = false;
    $("go").textContent = "Build covenant";
  }
}

function copy(id) {
  const el = $(id);
  navigator.clipboard?.writeText(el.value || el.textContent || "");
}

function boot() {
  paintTemplates();
  $("go")?.addEventListener("click", build);
  $("prompt")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) build();
  });
  $("copy-sil")?.addEventListener("click", () => copy("out-sil"));
  $("copy-args")?.addEventListener("click", () => copy("out-args"));
  $("copy-cmd")?.addEventListener("click", () => copy("out-cmd"));
  $("dl-sil")?.addEventListener("click", () => {
    const blob = new Blob([$("out-sil").value], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contract.sil";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

boot();
