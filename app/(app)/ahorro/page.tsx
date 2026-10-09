"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/components/HouseholdProvider";
import Stat from "@/components/Stat";
import { addMonths, currentMonth, monthLabel, money } from "@/lib/format";
import type { SavingsGoal } from "@/lib/types";

const num = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;
const empty = { name: "", target: "", saved: "", monthly_contribution: "" };

export default function AhorroPage() {
  const { supabase, household } = useHousehold();
  const [goals, setGoals] = useState<SavingsGoal[] | null>(null);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("savings_goals").select("*").eq("household_id", household.id).order("created_at");
    setGoals(
      (data ?? []).map((g) => ({
        ...g,
        target: Number(g.target),
        saved: Number(g.saved),
        monthly_contribution: Number(g.monthly_contribution),
      })),
    );
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const payload = {
      household_id: household.id,
      name: form.name,
      target: num(form.target),
      saved: num(form.saved),
      monthly_contribution: num(form.monthly_contribution),
    };
    if (editingId) await supabase.from("savings_goals").update(payload).eq("id", editingId);
    else await supabase.from("savings_goals").insert(payload);
    setForm(null);
    setEditingId(null);
    load();
  }

  async function deposit(g: SavingsGoal, sign: 1 | -1) {
    const input = prompt(
      sign === 1 ? `¿Cuánto abonamos a "${g.name}"?` : `¿Cuánto sacamos de "${g.name}"?`,
      String(Math.round(g.monthly_contribution)),
    );
    if (!input) return;
    const saved = Math.max(0, g.saved + sign * num(input));
    await supabase.from("savings_goals").update({ saved }).eq("id", g.id);
    load();
  }

  async function remove(g: SavingsGoal) {
    if (!confirm(`¿Borrar la meta "${g.name}"?`)) return;
    await supabase.from("savings_goals").delete().eq("id", g.id);
    load();
  }

  const totalSaved = (goals ?? []).reduce((a, g) => a + g.saved, 0);
  const totalMonthly = (goals ?? []).reduce((a, g) => a + g.monthly_contribution, 0);
  const totalTarget = (goals ?? []).reduce((a, g) => a + g.target, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Ahorro y metas</h1>
          <p className="muted">Colchón de imprevistos, viaje de diciembre, ropa, el bebé... ¿cuánto llevamos?</p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setEditingId(null);
            setForm(form ? null : empty);
          }}
        >
          ＋ Nueva meta
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Ahorrado" value={money(totalSaved)} tone="good" />
        <Stat label="Aporte mensual" value={money(totalMonthly)} />
        <Stat label="Falta para todas las metas" value={money(Math.max(0, totalTarget - totalSaved))} />
      </div>

      {form && (
        <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["name", "Meta", "Ej: Colchón imprevistos"],
              ["target", "¿Cuánto queremos?", "15000000"],
              ["saved", "¿Cuánto llevamos?", "669480"],
              ["monthly_contribution", "Aporte mensual", "300000"],
            ] as const
          ).map(([k, label, ph]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input
                className="input"
                required={k === "name"}
                placeholder={ph}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex items-end gap-2">
            <button className="btn flex-1">Guardar</button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
              ✕
            </button>
          </div>
        </form>
      )}

      {!goals ? (
        <p className="muted">Cargando...</p>
      ) : goals.length === 0 ? (
        <div className="card text-center muted">Aún no hay metas. Crea la primera con el botón “Nueva meta”.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const missing = Math.max(0, g.target - g.saved);
            const months = g.monthly_contribution > 0 ? Math.ceil(missing / g.monthly_contribution) : null;
            return (
              <div key={g.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-right text-sm">
                    <b>{money(g.saved)}</b> <span className="text-slate-400">de {money(g.target)}</span>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">
                    {missing === 0
                      ? "🎉 ¡Meta cumplida!"
                      : months
                        ? `Faltan ${money(missing)} · lista en ${monthLabel(addMonths(currentMonth(), months), true)}`
                        : `Faltan ${money(missing)}`}
                  </span>
                  <span className="flex gap-1">
                    <button className="btn-secondary px-2 py-1" onClick={() => deposit(g, 1)}>
                      ＋ Abonar
                    </button>
                    <button className="btn-secondary px-2 py-1" onClick={() => deposit(g, -1)}>
                      − Sacar
                    </button>
                    <button
                      className="btn-secondary px-2 py-1"
                      onClick={() => {
                        setEditingId(g.id);
                        setForm({
                          name: g.name,
                          target: String(Math.round(g.target)),
                          saved: String(Math.round(g.saved)),
                          monthly_contribution: String(Math.round(g.monthly_contribution)),
                        });
                      }}
                    >
                      Editar
                    </button>
                    <button className="btn-danger" onClick={() => remove(g)}>
                      ✕
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
