import { useState, useEffect } from "react";

const fmt = (n) => `€${Number(n).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 8);
const STORAGE_KEY = "scalata-v1";

const SKIP = new Set(["capitaleInput", "oddsInput", "stakeInput"]);
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

const INIT = {
  phase: "setup",
  capitale: 0,
  tesoretto: 0,
  capitaleInput: "",
  vaultPct: 30,
  ladderIndex: 0,
  step: 0,
  stake: 0,
  odds: null,
  oddsInput: "",
  stakeInput: "",
  ladders: [],
  activeLadder: null,
};

export default function App() {
  const [s, setS] = useState(() => {
    const saved = loadFromStorage();
    return saved ? { ...INIT, ...saved, capitaleInput: "", oddsInput: "", stakeInput: "" } : INIT;
  });
  const [err, setErr] = useState("");
  const [prelievoInput, setPrelievoInput] = useState("");
  const [prelievoErr, setPrelievoErr] = useState("");
  const [saved, setSaved] = useState(false);

  // Salva ad ogni cambio di stato
  useEffect(() => {
    if (s.phase !== "setup") {
      saveToStorage(s);
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1200);
      return () => clearTimeout(t);
    }
  }, [s]);

  const set = (patch) => setS((p) => ({ ...p, ...patch }));

  const handleStart = () => {
    const cap = parseFloat(s.capitaleInput);
    if (!cap || cap <= 0) { setErr("Inserisci un capitale valido."); return; }
    setErr("");
    set({ capitale: cap, capitaleInput: "", phase: "pick_stake" });
  };

  const handlePickStake = () => {
    const stk = parseFloat(s.stakeInput);
    if (!stk || stk <= 0) { setErr("Importo non valido."); return; }
    if (stk > s.capitale) { setErr(`Max disponibile: ${fmt(s.capitale)}`); return; }
    setErr("");
    const id = uid();
    const idx = s.ladderIndex + 1;
    set({
      capitale: s.capitale - stk,
      stake: stk, step: 1, odds: null, oddsInput: "", stakeInput: "",
      ladderIndex: idx, activeLadder: id,
      ladders: [{ id, index: idx, steps: [], finished: false }, ...s.ladders],
      phase: "set_odds",
    });
  };

  const handleSetOdds = () => {
    const o = parseFloat(s.oddsInput.replace(",", "."));
    if (!o || o < 1.01) { setErr("Quota non valida."); return; }
    if (o < 2) setErr("⚠️ Quota sotto 2.00 — procedi comunque?");
    else setErr("");
    set({ odds: o, phase: "result" });
  };

  const handleWin = () => {
    const gross = s.stake * s.odds;
    const toTesoretto = (gross - s.stake) * (s.vaultPct / 100);
    const nextStake = gross - toTesoretto;
    const stepObj = { n: s.step, odds: s.odds, stake: s.stake, result: "win", gross, toTesoretto, nextStake };
    setErr("");
    set({
      tesoretto: s.tesoretto + toTesoretto,
      stake: nextStake, step: s.step + 1, odds: null, oddsInput: "",
      ladders: s.ladders.map((l) => l.id !== s.activeLadder ? l : { ...l, steps: [...l.steps, stepObj] }),
      phase: "set_odds",
    });
  };

  const handleLoss = () => {
    const stepObj = { n: s.step, odds: s.odds, stake: s.stake, result: "loss", gross: 0, toTesoretto: 0, nextStake: 0 };
    setErr("");
    set({
      stake: 0, step: 0, odds: null, oddsInput: "", activeLadder: null,
      ladders: s.ladders.map((l) => l.id !== s.activeLadder ? l : { ...l, steps: [...l.steps, stepObj], finished: true }),
      phase: "pick_stake",
    });
  };

  const handleCashOut = () => {
    set({
      capitale: s.capitale + s.stake, stake: 0, step: 0, odds: null, oddsInput: "", activeLadder: null,
      ladders: s.ladders.map((l) => l.id !== s.activeLadder ? l : { ...l, finished: true, cashedOut: true }),
      phase: "pick_stake",
    });
  };

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
  const totalAssets = s.capitale + s.tesoretto + (s.stake > 0 ? s.stake : 0);

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
          {saved && <div className="text-[10px] text-emerald-700 uppercase tracking-widest mt-2">✓ salvato</div>}
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
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">
                % profitto → Tesoretto: <span className="text-emerald-400 font-bold">{s.vaultPct}%</span>
              </label>
              <input type="range" min={10} max={90} step={5} value={s.vaultPct}
                onChange={(e) => setS((p) => ({ ...p, vaultPct: Number(e.target.value) }))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                <span>10% aggressivo</span><span>90% conservativo</span>
              </div>
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

        {/* PICK STAKE */}
        {s.phase === "pick_stake" && (
          <div className="rounded-2xl border border-amber-700/30 bg-amber-950/20 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-widest">Scalata #{s.ladderIndex + 1}</span>
              <Badge label={`Capitale: ${fmt(s.capitale)}`} color="amber" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">Quanto peschi dal Capitale?</label>
              <input type="number" min="0.5" step="0.5" placeholder={`max ${fmt(s.capitale)}`}
                value={s.stakeInput}
                onChange={(e) => setS((p) => ({ ...p, stakeInput: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handlePickStake()}
                className="w-full bg-black/50 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            {err && <div className="text-red-400 text-xs">{err}</div>}
            <button onClick={handlePickStake}
              className="w-full bg-amber-700 hover:bg-amber-600 active:scale-95 font-black py-3 rounded-xl uppercase tracking-widest text-sm transition-all">
              🎯 Avvia scalata
            </button>
          </div>
        )}

        {/* SCALATA ATTIVA */}
        {(s.phase === "set_odds" || s.phase === "result") && (
          <div className="rounded-2xl border border-gray-700/40 bg-gray-900/30 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 uppercase tracking-widest">Scalata #{s.ladderIndex} · Gradino {s.step}</span>
              <Badge label={`Puntata: ${fmt(s.stake)}`} color="amber" />
            </div>
            <div className="flex gap-6">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Puntata</div>
                <div className="text-2xl font-black text-amber-300">{fmt(s.stake)}</div>
              </div>
              {s.odds && (
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Vincita lorda</div>
                  <div className="text-2xl font-black text-emerald-300">{fmt(s.stake * s.odds)}</div>
                </div>
              )}
            </div>

            {s.phase === "set_odds" && (
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">Quota (anche combinata)</label>
                <div className="flex gap-2">
                  <input type="text" inputMode="decimal" placeholder="es. 2.40"
                    value={s.oddsInput}
                    onChange={(e) => setS((p) => ({ ...p, oddsInput: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleSetOdds()}
                    className="flex-1 bg-black/50 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                  <button onClick={handleSetOdds}
                    className="bg-gray-700 hover:bg-gray-600 active:scale-95 px-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all">
                    Set
                  </button>
                </div>
                {err && <div className="text-red-400 text-xs mt-1.5">{err}</div>}
              </div>
            )}

            {s.phase === "result" && s.odds && (
              <div className="bg-black/30 rounded-xl p-3 flex flex-col gap-1.5 text-xs border border-gray-700/30">
                <div className="text-gray-500 uppercase tracking-widest text-[10px] mb-0.5">Anteprima @{s.odds}</div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Vincita lorda</span>
                  <span className="text-white font-bold">{fmt(s.stake * s.odds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">→ Tesoretto ({s.vaultPct}% profitto)</span>
                  <span className="text-emerald-400 font-bold">+{fmt((s.stake * s.odds - s.stake) * s.vaultPct / 100)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700/30 pt-1.5 mt-0.5">
                  <span className="text-gray-400">→ Puntata G{s.step + 1}</span>
                  <span className="text-amber-400 font-bold">{fmt(s.stake * s.odds - (s.stake * s.odds - s.stake) * s.vaultPct / 100)}</span>
                </div>
              </div>
            )}

            {s.phase === "result" && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleWin}
                    className="bg-emerald-700 hover:bg-emerald-600 active:scale-95 py-3.5 rounded-xl font-black uppercase tracking-widest text-sm transition-all">
                    ✅ Vinto
                  </button>
                  <button onClick={handleLoss}
                    className="bg-red-800 hover:bg-red-700 active:scale-95 py-3.5 rounded-xl font-black uppercase tracking-widest text-sm transition-all">
                    ❌ Perso
                  </button>
                </div>
                <button onClick={handleCashOut}
                  className="w-full bg-gray-800 hover:bg-gray-700 active:scale-95 py-2.5 rounded-xl text-xs uppercase tracking-widest text-gray-400 transition-all">
                  💼 Chiudi e incassa (recupera stake)
                </button>
                <button onClick={() => setS((p) => ({ ...p, phase: "set_odds", odds: null, oddsInput: "" }))}
                  className="text-[10px] text-gray-600 hover:text-gray-400 uppercase tracking-widest transition-colors text-center">
                  ← Cambia quota
                </button>
              </div>
            )}
          </div>
        )}

        {/* STORICO */}
        {s.ladders.length > 0 && (
          <div className="rounded-2xl border border-gray-700/40 bg-gray-900/30 p-5 flex flex-col gap-3">
            <div className="text-xs uppercase tracking-widest text-gray-500">
              Storico scalate <span className="text-gray-700">({s.ladders.length})</span>
            </div>
            {s.ladders.map((l) => {
              const isActive = l.id === s.activeLadder;
              const lastStep = l.steps[l.steps.length - 1];
              const toTesorettoTot = l.steps.filter(st => st.result === "win").reduce((a, st) => a + st.toTesoretto, 0);
              const lostStake = lastStep?.result === "loss" ? lastStep.stake : 0;
              return (
                <details key={l.id} open={isActive}
                  className={`rounded-xl border ${isActive ? "border-amber-600/40 bg-amber-950/10" : "border-gray-700/30 bg-gray-800/20"}`}>
                  <summary className="px-4 py-3 cursor-pointer flex items-center justify-between select-none list-none">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 text-xs font-mono">#{l.index}</span>
                      {isActive ? <Badge label="IN CORSO" color="amber" />
                        : lastStep?.result === "loss" ? <Badge label="BRUCIATA" color="red" />
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
                        <div>
                          {st.result === "win"
                            ? <span className="text-emerald-300">+{fmt(st.toTesoretto)} <span className="text-gray-600">tesoretto</span></span>
                            : <span className="text-red-400">❌ persa</span>}
                        </div>
                      </div>
                    ))}
                    {isActive && (
                      <div className="rounded-lg px-3 py-2 flex items-center justify-between text-xs border border-amber-600/30 bg-amber-900/10">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">G{s.step}</span>
                          {s.odds ? <span className="text-gray-400">@{s.odds}</span> : <span className="text-gray-600 italic">quota da impostare</span>}
                          <span className="text-amber-400">{fmt(s.stake)}</span>
                        </div>
                        <Badge label="live" color="amber" />
                      </div>
                    )}
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
