"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useHousehold } from "./HouseholdProvider";
import { money } from "@/lib/format";
import type { Debt, DebtMovement } from "@/lib/types";

const num = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
const today = () => new Date().toISOString().slice(0, 10);

/** Historial de cargos y abonos de una deuda, con gráfica del saldo */
export default function DebtHistory({ debt, onChange }: { debt: Debt; onChange: () => void }) {
  const { supabase, household } = useHousehold();
  const [moves, setMoves] = useState<DebtMovement[] | null>(null);
  const [form, setForm] = useState({ date: today(), description: "", kind: "abono" as "abono" | "cargo", amount: "" });

  async function load() {
    const { data } = await supabase.from("debt_movements").select("*").eq("debt_id", debt.id).order("date").order("created_at");
    setMoves((data ?? []).map((m) => ({ ...m, amount: Number(m.amount), balance_after: Number(m.balance_after) })));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = num(form.amount);
    if (!value) return;
    const amount = form.kind === "abono" ? -value : value;
    const balance = Math.max(0, debt.balance + amount);
    await supabase.from("debt_movements").insert({
      household_id: household.id,
      debt_id: debt.id,
      date: form.date,
      description: form.description || (form.kind === "abono" ? "Abono" : "Cargo"),
      amount,
      balance_after: balance,
    });
    await supabase.from("debts").update({ balance, active: balance > 0 }).eq("id", debt.id);
    setForm({ ...form, description: "", amount: "" });
    await load();
    onChange();
  }

  async function remove(m: DebtMovement) {
    if (!confirm(`¿Borrar "${m.description}"? El saldo de la deuda no cambia; ajústalo con "Editar" si hace falta.`)) return;
    await supabase.from("debt_movements").delete().eq("id", m.id);
    load();
  }

  if (!moves) return <p className="muted mt-3">Cargando historial...</p>;
  const paid = moves.filter((m) => m.amount < 0).reduce((a, m) => a - m.amount, 0);
  const charged = moves.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0);

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      {moves.length > 1 && (
        <div className="h-40">
          <ResponsiveContainer>
            <LineChart data={moves.map((m) => ({ fecha: m.date, saldo: m.balance_after }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="fecha" fontSize={10} tickFormatter={(d: string) => d.slice(0, 7)} />
              <YAxis fontSize={10} tickFormatter={short} width={40} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Line dataKey="saldo" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {moves.length > 0 && (
        <p className="text-sm text-slate-600">
          Cargos: <b>{money(charged)}</b> · Abonos: <b className="text-emerald-700">{money(paid)}</b>
        </p>
      )}
      <div className="max-h-64 overflow-y-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Movimiento</th>
              <th className="text-right">Valor</th>
              <th className="text-right">Saldo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...moves].reverse().map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{m.date}</td>
                <td>{m.description}</td>
                <td className={`whitespace-nowrap text-right ${m.amount < 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {m.amount < 0 ? "−" : "+"}
                  {money(Math.abs(m.amount))}
                </td>
                <td className="whitespace-nowrap text-right font-medium">{money(m.balance_after)}</td>
                <td>
                  <button className="btn-danger" onClick={() => remove(m)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {moves.length === 0 && <p className="muted py-2">Aún no hay movimientos registrados.</p>}
      </div>
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto_auto]">
        <input className="input py-1" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select className="input py-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "abono" | "cargo" })}>
          <option value="abono">Abono (baja)</option>
          <option value="cargo">Cargo (sube)</option>
        </select>
        <input
          className="input py-1"
          placeholder="Descripción (ej: Abono octubre)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          className="input py-1"
          inputMode="numeric"
          placeholder="Valor"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <button className="btn py-1">Registrar</button>
      </form>
    </div>
  );
}
