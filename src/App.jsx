import { useState, useEffect } from "react";

const fmt = (n) => `€${Number(n).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 8);
const STORAGE_KEY = "scalata-v2";
const MAX_ACTIVE = 3;

const SKIP = new Set(["capitaleInput", "stakeInputs", "oddsInputs"]);
function toSave(state) {
  return Object.fromEntries(Object.entries(state).filter(([k]) => !SKIP.has(k)));
}
function saveToStorage(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave(state))); } catch (_) {}
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function Badge({ label, color }) {
  const c = {
    green: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    red:   "bg-red-500/20 text-red-300 border-red-500/30",
    amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    gray:  "bg-gray-700/40 text-gray-400 border-gray-600/30",
    blue:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
    purple:"bg-purple-500/20 text-purple-300 border-purple-500/30",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono tracking-wider ${c[color]}`}>
      {label}
    </span>
  );
}

function Serbatoio({ label, amount, sub, color }) {
  const border = color === "gold"
    ? "border-amber-600/40 from-amber-950/40 to-yellow-950/20"
    : "border-emerald-600/40 from-emerald-950/40 to-teal-950/20";
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 flex flex-col gap-0.5 ${border}`}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{label}</div>
      <div className="text-2xl font-black text-white" style={{ fontFamily: "monospace" }}>{fmt(amount)}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// Colori per i 3 slot paralleli
const SLOT_COLORS = [
  { border: "border-blue-600/40 bg-blue-950/20", badge: "blue", accent: "text-blue-300", btn: "bg-blue-900/40 hover:bg-blue-800/50 border-blue-700/30" },
  { border: "border-purple-600/40 bg-purple-950/20", badge: "purple", accent: "text-purple-300", btn: "bg-purple-900/40 hover:bg-purple-800/50 border-purple-700/30" },
  { border: "border-amber-600/40 bg-amber-950/20", badge: "amber", accent: "text-amber-300", btn: "bg-amber-900/40 hover:bg-amber-800/50 border-amber-700/30" },
];
const SLOT_LABELS = ["A", "B", "C"];

// Una scalata attiva: { id, slotIndex, index, step, stake, odds, vaultPct, steps[] }
const INIT = {
  phase: "setup",       // "setup" | "running"
  capitale: 0,
  tesoretto: 0,
  capitaleInput: "",
  ladderIndex: 0,       // counter globale scalate
  activeSlots: [],      // max 3 scalate attive [ {id, slotIndex, index, step, stake, odds, vaultPct, steps[]} ]
  stakeInputs: {},      // { slotIndex: "" } input temporanei
  oddsInputs: {},       // { slotIndex: "" }
  history: [],          // scalate chiuse
};

export default function App() {
  const [s, setS] = useState(() => {
    const saved = loadFromStorage();
    return saved ? { ...INIT, ...saved, capitaleInput: "", stakeInputs: {}, oddsInputs: {} } : INIT;
  });
  const [err, setErr] = useState("");
  const [prelievoInput, setPrelievoInput] = useState("");
  const [prelievoErr, setPrelievoErr] = useState("");
  const [savedIndicator, setSavedIndicator] = useState(false);

  useEffect(() => {
    if (s.phase !== "setup") {
      saveToStorage(s);
      setSavedIndicator(true);
      const t = setTimeout(() => setSavedIndicator(false), 1200);
      return () => clearTimeout(t);
    }
  }, [s]);

  const set = (patch) => setS((p) => ({ ...p, ...patch }));

  /* ── SETUP ── */
  const handleStart = () => {
    const cap = parseFloat(s.capitaleInput);
    if (!cap || cap <= 0) { setErr("Inserisci un capitale valido."); return; }
    setErr("");
    set({ capitale: cap, capitaleInput: "", phase: "running" });
  };

  /* ── NUOVA SCALATA in uno slot libero ── */
  const handleOpenSlot = (slotIndex) => {
    const stk = parseFloat((s.stakeInputs[slotIndex] || "").replace(",", "."));
    if (!stk || stk <= 0) { setErr(`Slot ${SLOT_LABELS[slotIndex]}: importo non valido.`); return; }
    if (stk > s.capitale) { setErr(`Max disponibile: ${fmt(s.capitale)}`); return; }
    setErr("");
    const id = uid();
    const idx = s.ladderIndex + 1;
    const newSlot = { id, slotIndex, index: idx, step: 1, stake: stk, odds: null, vaultPct: 30, steps: [] };
    set({
      capitale: s.capitale - stk,
      ladderIndex: idx,
      activeSlots: [...s.activeSlots, newSlot],
      stakeInputs: { ...s.stakeInputs, [slotIndex]: "" },
    });
  };

  /* ── SET ODDS per uno slot ── */
  const handleSetOdds = (slotIndex) => {
    const o = parseFloat((s.oddsInputs[slotIndex] || "").replace(",", "."));
    if (!o || o < 1.01) { setErr("Quota non valida."); return; }
    if (o < 2) setErr("⚠️ Quota sotto 2.00 — procedi comunque?");
    else setErr("");
    set({
      activeSlots: s.activeSlots.map((sl) => sl.slotIndex === slotIndex ? { ...sl, odds: o } : sl),
    });
  };

  /* ── WIN ── */
  const handleWin = (slotIndex) => {
    const sl = s.activeSlots.find((x) => x.slotIndex === slotIndex);
    if (!sl?.odds) return;
    const gross = sl.stake * sl.odds;
    const toTesoretto = (gross - sl.stake) * (sl.vaultPct / 100);
    const nextStake = gross - toTesoretto;
    const stepObj = { n: sl.step, odds: sl.odds, stake: sl.stake, result: "win", gross, toTesoretto, nextStake };
    setErr("");
    set({
      tesoretto: s.tesoretto + toTesoretto,
      oddsInputs: { ...s.oddsInputs, [slotIndex]: "" },
      activeSlots: s.activeSlots.map((x) => x.slotIndex !== slotIndex ? x : {
        ...x, step: x.step + 1, stake: nextStake, odds: null, steps: [...x.steps, stepObj],
      }),
    });
  };

  /* ── LOSS ── */
  const handleLoss = (slotIndex) => {
    const sl = s.activeSlots.find((x) => x.slotIndex === slotIndex);
    if (!sl?.odds) return;
    const stepObj = { n: sl.step, odds: sl.odds, stake: sl.stake, result: "loss", gross: 0, toTesoretto: 0 };
    setErr("");
    set({
      oddsInputs: { ...s.oddsInputs, [slotIndex]: "" },
      activeSlots: s.activeSlots.filter((x) => x.slotIndex !== slotIndex),
      history: [{ ...sl, steps: [...sl.steps, stepObj], finished: true }, ...s.history],
    });
  };

  /* ── CASH OUT ── */
  const handleCashOut = (slotIndex) => {
    const sl = s.activeSlots.find((x) => x.slotIndex === slotIndex);
    if (!sl) return;
    set({
      capitale: s.capitale + sl.stake,
      activeSlots: s.activeSlots.filter((x) => x.slotIndex !== slotIndex),
      history: [{ ...sl, finished: true, cashedOut: true }, ...s.history],
    });
  };

  /* ── VAULT PCT per slot ── */
  const handleVaultPct = (slotIndex, val) => {
    set({ activeSlots: s.activeSlots.map((x) => x.slotIndex === slotIndex ? { ...x, vaultPct: val } : x) });
  };

  /* ── PRELIEVO ── */
  const handlePrelievo = () => {
    const amt = parseFloat(prelievoInput);
    if (!amt || amt <= 0) { setPrelievoErr("Importo non valido."); return; }
    if (amt > s.tesoretto) { setPrelievoErr(`Max: ${fmt(s.tesoretto)}`); return; }
    setPrelievoErr(""); setPrelievoInput("");
    set({ tesoretto: s.tesoretto - amt, capitale: s.capitale + amt });
  };
  const handlePrelievoTutto = () => {
    if (s.tesoretto <= 0) return;
    setPrelievoInput("");
    set({ capitale: s.capitale + s.tesoretto, tesoretto: 0 });
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setS(INIT);
    setErr(""); setPrelievoInput(""); setPrelievoErr("");
  };

  const started = s.phase !== "setup";
  const totalAssets = s.capitale + s.tesoretto + s.activeSlots.reduce((a, sl) => a + sl.stake, 0);
  const usedSlots = s.activeSlots.map((x) => x.slotIndex);
  const freeSlots = [0, 1, 2].filter((i) => !usedSlots.includes(i));

  return (
    <div className="min-h-screen text-white"
      style={{ background: "radial-gradient(ellipse at 20% 10%, #0c1520 0%, #06090d 70%)", fontFamily: "'Courier New', monospace" }}>
      <div className="max-w-lg mx-auto px-4 py-6 pb-16 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-[10px] uppercase tracking-[0.35em] text-gray-600">Sistema</div>
            <h1 className="text-4xl font-black tracking-tight leading-none mt-0.5">LA SCALATA</h1>
            <div className="text-[10px] text-gray-600 tracking-[0.25em] mt-1">BETTING LADDER TRACKER</div>
          </div>
          {savedIndicator && <div className="text-[10px] text-emerald-700 uppercase tracking-widest mt-2">✓ salvato</div>}
        </div>

        {/* SETUP */}
        {s.phase === "setup" && (
          <div className="rounded-2xl border border-gray-700/50 bg-gray-900/30 p-5 flex flex-col gap-4">
            <div className="text-xs text-gray-400 uppercase tracking-widest">Configurazione iniziale</div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">Capitale di partenza (€)</label>
              <input type="number" min="1" placeholder="es. 100"
                value={s.capitaleInput}
                onChange={(e) => setS((p) => ({ ...p, capitaleInput: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            {err && <div className="text-red-400 text-xs">{err}</div>}
            <button onClick={handleStart}
              className="mt-1 w-full bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-black py-3 rounded-xl tracking-[0.2em] uppercase text-sm transition-all">
              Inizia
            </button>
          </div>
        )}

        {/* SERBATOI */}
        {started && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <Serbatoio label="💰 Capitale" amount={s.capitale} sub={`Assets: ${fmt(totalAssets)}`} color="gold" />
              <Serbatoio label="🏆 Tesoretto" amount={s.tesoretto} sub={s.tesoretto > 0 ? "al sicuro ✓" : "ancora vuoto"} color="green" />
            </div>
            {/* Prelievo */}
            <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-4 flex flex-col gap-3">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">↙ Preleva dal Tesoretto al Capitale</span>
              <div className="flex gap-2">
                <input type="number" min="0.01" step="0.5"
                  placeholder={s.tesoretto > 0 ? `max ${fmt(s.tesoretto)}` : "Tesoretto vuoto"}
                  value={prelievoInput} disabled={s.tesoretto <= 0}
                  onChange={(e) => setPrelievoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePrelievo()}
                  className="flex-1 bg-black/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-30"
                />
                <button onClick={handlePrelievo} disabled={s.tesoretto <= 0}
                  className="bg-emerald-800 hover:bg-emerald-700 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                  Sposta
                </button>
              </div>
              {prelievoErr && <div className="text-red-400 text-xs">{prelievoErr}</div>}
              <button onClick={handlePrelievoTutto} disabled={s.tesoretto <= 0}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest transition-colors text-center bg-emerald-900/30 hover:bg-emerald-900/50 py-2 rounded-lg border border-emerald-700/20">
                Preleva tutto {s.tesoretto > 0 ? `(${fmt(s.tesoretto)})` : ""}
              </button>
            </div>
          </div>
        )}

        {/* SCALATE ATTIVE */}
        {started && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-gray-500">Scalate attive</span>
              <span className="text-[10px] text-gray-700">{s.activeSlots.length}/{MAX_ACTIVE}</span>
            </div>

            {/* Slot attivi */}
            {s.activeSlots.map((sl) => {
              const col = SLOT_COLORS[sl.slotIndex];
              const oddsVal = s.oddsInputs[sl.slotIndex] ?? "";
              const gross = sl.odds ? sl.stake * sl.odds : 0;
              const toTesoretto = sl.odds ? (gross - sl.stake) * (sl.vaultPct / 100) : 0;
              const nextStake = gross - toTesoretto;

              return (
                <div key={sl.id} className={`rounded-2xl border p-4 flex flex-col gap-3 ${col.border}`}>
                  {/* Header slot */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-black ${col.accent}`}>{SLOT_LABELS[sl.slotIndex]}</span>
                      <Badge label={`Scalata #${sl.index}`} color={col.badge} />
                      <Badge label={`G${sl.step}`} color="gray" />
                    </div>
                    <span className={`text-sm font-black ${col.accent}`}>{fmt(sl.stake)}</span>
                  </div>

                  {/* Odds input + vincita */}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Quota</label>
                      <div className="flex gap-2">
                        <input type="text" inputMode="decimal" placeholder="es. 2.40"
                          value={oddsVal}
                          onChange={(e) => set({ oddsInputs: { ...s.oddsInputs, [sl.slotIndex]: e.target.value } })}
                          onKeyDown={(e) => e.key === "Enter" && handleSetOdds(sl.slotIndex)}
                          className="flex-1 bg-black/50 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 transition-colors"
                        />
                        <button onClick={() => handleSetOdds(sl.slotIndex)}
                          className="bg-gray-700 hover:bg-gray-600 active:scale-95 px-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
                          Set
                        </button>
                      </div>
                    </div>
                    {sl.odds && (
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Lordo</div>
                        <div className="text-lg font-black text-emerald-300">{fmt(gross)}</div>
                      </div>
                    )}
                  </div>

                  {/* % Tesoretto */}
                  <div className="bg-black/20 rounded-xl px-3 py-2.5 flex flex-col gap-1 border border-gray-700/20">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">
                      % → Tesoretto: <span className="text-emerald-400 font-bold">{sl.vaultPct}%</span>
                    </label>
                    <input type="range" min={0} max={100} step={5} value={sl.vaultPct}
                      onChange={(e) => handleVaultPct(sl.slotIndex, Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  {/* Anteprima */}
                  {sl.odds && (
                    <div className="bg-black/20 rounded-xl px-3 py-2 flex flex-col gap-1 text-xs border border-gray-700/20">
                      <div className="flex justify-between">
                        <span className="text-gray-500">→ Tesoretto</span>
                        <span className="text-emerald-400 font-bold">+{fmt(toTesoretto)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">→ Puntata G{sl.step + 1}</span>
                        <span className={`font-bold ${col.accent}`}>{fmt(nextStake)}</span>
                      </div>
                    </div>
                  )}

                  {/* Bottoni */}
                  {sl.odds && (
                    <div className="flex flex-col gap-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleWin(sl.slotIndex)}
                          className="bg-emerald-700 hover:bg-emerald-600 active:scale-95 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all">
                          ✅ Vinto
                        </button>
                        <button onClick={() => handleLoss(sl.slotIndex)}
                          className="bg-red-800 hover:bg-red-700 active:scale-95 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all">
                          ❌ Perso
                        </button>
                      </div>
                      <button onClick={() => handleCashOut(sl.slotIndex)}
                        className="w-full bg-gray-800 hover:bg-gray-700 active:scale-95 py-2 rounded-xl text-xs uppercase tracking-widest text-gray-400 transition-all">
                        💼 Incassa e chiudi
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Slot liberi — apri nuova scalata */}
            {freeSlots.map((slotIndex) => {
              const col = SLOT_COLORS[slotIndex];
              const stakeVal = s.stakeInputs[slotIndex] ?? "";
              return (
                <div key={slotIndex} className={`rounded-2xl border border-dashed p-4 flex flex-col gap-3 opacity-60 hover:opacity-100 transition-opacity ${col.border}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-black ${col.accent}`}>{SLOT_LABELS[slotIndex]}</span>
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest">Slot libero</span>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" min="0.5" step="0.5"
                      placeholder={`Pesca dal Capitale (max ${fmt(s.capitale)})`}
                      value={stakeVal}
                      disabled={s.capitale <= 0}
                      onChange={(e) => set({ stakeInputs: { ...s.stakeInputs, [slotIndex]: e.target.value } })}
                      onKeyDown={(e) => e.key === "Enter" && handleOpenSlot(slotIndex)}
                      className="flex-1 bg-black/50 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white/30 transition-colors disabled:opacity-30"
                    />
                    <button onClick={() => handleOpenSlot(slotIndex)} disabled={s.capitale <= 0}
                      className={`px-4 rounded-xl text-xs font-black uppercase tracking-wider border transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${col.btn}`}>
                      + Avvia
                    </button>
                  </div>
                </div>
              );
            })}

            {err && <div className="text-red-400 text-xs px-1">{err}</div>}
          </div>
        )}

        {/* STORICO */}
        {s.history.length > 0 && (
          <div className="rounded-2xl border border-gray-700/40 bg-gray-900/30 p-5 flex flex-col gap-3">
            <div className="text-xs uppercase tracking-widest text-gray-500">
              Storico scalate <span className="text-gray-700">({s.history.length})</span>
            </div>
            {s.history.map((l) => {
              const lastStep = l.steps[l.steps.length - 1];
              const toTesorettoTot = l.steps.filter(st => st.result === "win").reduce((a, st) => a + st.toTesoretto, 0);
              const lostStake = lastStep?.result === "loss" ? lastStep.stake : 0;
              const col = SLOT_COLORS[l.slotIndex];
              return (
                <details key={l.id} className="rounded-xl border border-gray-700/30 bg-gray-800/20">
                  <summary className="px-4 py-3 cursor-pointer flex items-center justify-between select-none list-none">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-black ${col.accent}`}>{SLOT_LABELS[l.slotIndex]}</span>
                      <span className="text-gray-500 text-xs font-mono">#{l.index}</span>
                      {lastStep?.result === "loss" ? <Badge label="BRUCIATA" color="red" />
                        : l.cashedOut ? <Badge label="INCASSATA" color="blue" />
                        : <Badge label="CHIUSA" color="green" />}
                      <span className="text-gray-600 text-[10px]">{l.steps.length} step</span>
                    </div>
                    <div className="text-xs text-right flex flex-col items-end gap-0.5">
                      {toTesorettoTot > 0 && <span className="text-emerald-400 font-bold">+{fmt(toTesorettoTot)}</span>}
                      {lostStake > 0 && <span className="text-red-400 font-bold">-{fmt(lostStake)}</span>}
                    </div>
                  </summary>
                  <div className="px-4 pb-3 flex flex-col gap-1.5">
                    {l.steps.map((st, i) => (
                      <div key={i} className={`rounded-lg px-3 py-2 flex items-center justify-between text-xs border ${
                        st.result === "win" ? "bg-emerald-900/20 border-emerald-700/20" : "bg-red-900/20 border-red-700/20"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">G{st.n}</span>
                          <span className="text-gray-400">@{st.odds}</span>
                          <span className="text-gray-500">{fmt(st.stake)}</span>
                        </div>
                        {st.result === "win"
                          ? <span className="text-emerald-300">+{fmt(st.toTesoretto)} tesoretto</span>
                          : <span className="text-red-400">❌ persa</span>}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {started && (
          <button onClick={handleReset}
            className="text-[10px] text-gray-700 hover:text-red-700 uppercase tracking-widest transition-colors text-center mt-1">
            ⚠ Reset completo (cancella tutto)
          </button>
        )}

      </div>
    </div>
  );
}
