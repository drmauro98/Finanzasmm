"use client";

import { useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/components/HouseholdProvider";
import MonthPicker from "@/components/MonthPicker";
import Stat from "@/components/Stat";
import { fetchTransactions, summarize } from "@/lib/data";
import { monthRange, money } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { useMonth } from "@/lib/useMonth";

export default function PresupuestoPage() {
  const { supabase, household, categories, categoryById, reload } = useHousehold();
  const [month, setMonth] = useMonth();
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  useEffect(() => {
    const { start, end } = monthRange(month);
    fetchTransactions(supabase, household.id, start, end).then(setTxs);
  }, [supabase, household.id, month]);

  const summary = useMemo(() => (txs ? summarize(txs, categoryById) : null), [txs, categoryById]);
  const rows = categories
    .filter((c) => c.kind === "gasto")
    .map((c) => ({ ...c, spent: summary?.byCategory.get(c.id) ?? 0 }))
    .sort((a, b) => b.monthly_budget - a.monthly_budget || b.spent - a.spent);
  const totalBudget = rows.reduce((a, r) => a + r.monthly_budget, 0);
  const totalSpent = summary?.gastos ?? 0;

  async function saveBudget(id: string) {
    const value = Number((editing[id] ?? "").replace(/[^\d]/g, ""));
    await supabase.from("categories").update({ monthly_budget: value }).eq("id", id);
    setEditing(({ [id]: _, ...rest }) => rest);
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Presupuesto</h1>
          <p className="muted">Cuánto planeamos gastar en cada categoría vs. lo que realmente gastamos.</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Presupuesto del mes" value={money(totalBudget)} />
        <Stat label="Gastado" value={money(totalSpent)} tone={totalSpent > totalBudget ? "bad" : "neutral"} />
        <Stat
          label={totalBudget >= totalSpent ? "Disponible" : "Nos pasamos"}
          value={money(Math.abs(totalBudget - totalSpent))}
          tone={totalBudget >= totalSpent ? "good" : "bad"}
        />
      </div>

      <div className="card">
        <p className="muted mb-4">Toca el valor del presupuesto para cambiarlo. El presupuesto es el mismo todos los meses.</p>
        <div className="space-y-4">
          {rows.map((r) => {
            const pct = r.monthly_budget ? (r.spent / r.monthly_budget) * 100 : r.spent ? 100 : 0;
            const over = r.monthly_budget > 0 && r.spent > r.monthly_budget;
            return (
              <div key={r.id}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                    {r.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={over ? "font-medium text-red-600" : ""}>{money(r.spent)}</span>
                    <span className="text-slate-400">de</span>
                    {editing[r.id] !== undefined ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveBudget(r.id);
                        }}
                        className="flex gap-1"
                      >
                        <input
                          autoFocus
                          className="input w-32 py-1"
                          inputMode="numeric"
                          value={editing[r.id]}
                          onChange={(e) => setEditing({ ...editing, [r.id]: e.target.value })}
                        />
                        <button className="btn px-2 py-1">OK</button>
                      </form>
                    ) : (
                      <button
                        className="rounded px-1 text-slate-600 underline decoration-dotted hover:bg-slate-100"
                        onClick={() => setEditing({ ...editing, [r.id]: String(r.monthly_budget) })}
                      >
                        {r.monthly_budget ? money(r.monthly_budget) : "sin presupuesto"}
                      </button>
                    )}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${over ? "bg-red-500" : pct > 85 ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
