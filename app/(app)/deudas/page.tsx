"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/components/HouseholdProvider";
import Stat from "@/components/Stat";
import { monthsToPayoff } from "@/lib/debts";
import { addMonths, currentMonth, monthLabel, money } from "@/lib/format";
import type { Debt } from "@/lib/types";

const empty = {
  name: "",
  lender: "",
  owner: "Familia",
  original_amount: "",
  balance: "",
  monthly_payment: "",
  monthly_rate: "",
  installments_left: "",
  notes: "",
};
type Form = typeof empty;

// Acepta "34.556.016", "$ 34,556,016" o "34556016" (pesos sin decimales)
const num = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;

export default function DeudasPage() {
  const { supabase, household, people } = useHousehold();
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("debts").select("*").eq("household_id", household.id).order("balance", { ascending: false });
    setDebts(
      (data ?? []).map((d) => ({
        ...d,
        balance: Number(d.balance),
        original_amount: Number(d.original_amount),
        monthly_payment: Number(d.monthly_payment),
        monthly_rate: Number(d.monthly_rate),
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
      lender: form.lender || null,
      owner: form.owner,
      original_amount: num(form.original_amount) || num(form.balance),
      balance: num(form.balance),
      monthly_payment: num(form.monthly_payment),
      monthly_rate: Number(form.monthly_rate.replace(",", ".")) || 0,
      installments_left: Math.round(num(form.installments_left)),
      notes: form.notes || null,
    };
    if (editingId) await supabase.from("debts").update(payload).eq("id", editingId);
    else await supabase.from("debts").insert(payload);
    setForm(null);
    setEditingId(null);
    load();
  }

  function edit(d: Debt) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      lender: d.lender ?? "",
      owner: d.owner,
      original_amount: String(Math.round(d.original_amount)),
      balance: String(Math.round(d.balance)),
      monthly_payment: String(Math.round(d.monthly_payment)),
      monthly_rate: String(d.monthly_rate),
      installments_left: String(d.installments_left),
      notes: d.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Registra el pago de la cuota de este mes: descuenta capital y una cuota */
  async function pay(d: Debt) {
    const interest = (d.balance * d.monthly_rate) / 100;
    const last = d.installments_left === 1;
    const capital = last ? d.balance : Math.max(0, d.monthly_payment - interest);
    const balance = Math.max(0, Math.round(d.balance - capital));
    const installments_left = Math.max(0, d.installments_left - 1);
    if (!confirm(`¿Registrar pago de ${money(d.monthly_payment)} a "${d.name}"? Saldo nuevo: ${money(balance)}`)) return;
    await supabase
      .from("debts")
      .update({ balance, installments_left, active: balance > 0 })
      .eq("id", d.id);
    load();
  }

  async function remove(d: Debt) {
    if (!confirm(`¿Borrar la deuda "${d.name}"?`)) return;
    await supabase.from("debts").delete().eq("id", d.id);
    load();
  }

  const active = (debts ?? []).filter((d) => d.active && d.balance > 0);
  const total = active.reduce((a, d) => a + d.balance, 0);
  const monthly = active.reduce((a, d) => a + d.monthly_payment, 0);
  const payoffs = active.map(monthsToPayoff);
  const maxMonths = payoffs.every((m) => m !== null) && payoffs.length ? Math.max(...(payoffs as number[])) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Deudas</h1>
          <p className="muted">Carro, compras a cuotas, préstamos... y cuándo quedamos libres de cada una.</p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setEditingId(null);
            setForm(form ? null : empty);
          }}
        >
          ＋ Nueva deuda
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Debemos en total" value={money(total)} tone={total > 0 ? "bad" : "good"} />
        <Stat label="Cuotas al mes" value={money(monthly)} />
        <Stat
          label="Libres de deudas"
          value={maxMonths === null ? "—" : maxMonths === 0 ? "¡Ya!" : monthLabel(addMonths(currentMonth(), maxMonths - 1), true)}
          hint={maxMonths ? `en ${maxMonths} meses si seguimos pagando igual` : undefined}
          tone="good"
        />
      </div>

      {form && (
        <form onSubmit={save} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="font-semibold sm:col-span-2 lg:col-span-4">{editingId ? "Editar deuda" : "Nueva deuda"}</h2>
          <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ej: Cuota carro" required />
          <Field label="Banco / a quién" value={form.lender} onChange={(v) => setForm({ ...form, lender: v })} placeholder="Ej: Sufi" />
          <div>
            <label className="label">De quién</label>
            <select className="input" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <Field label="Valor inicial" value={form.original_amount} onChange={(v) => setForm({ ...form, original_amount: v })} placeholder="45143040" />
          <Field label="Saldo pendiente hoy" value={form.balance} onChange={(v) => setForm({ ...form, balance: v })} placeholder="34556016" required />
          <Field label="Cuota mensual" value={form.monthly_payment} onChange={(v) => setForm({ ...form, monthly_payment: v })} placeholder="2171987" required />
          <Field label="Cuotas que faltan" value={form.installments_left} onChange={(v) => setForm({ ...form, installments_left: v })} placeholder="17" />
          <Field label="Interés % mes (opcional)" value={form.monthly_rate} onChange={(v) => setForm({ ...form, monthly_rate: v })} placeholder="2.1593" />
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Notas" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn flex-1">Guardar</button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!debts ? (
        <p className="muted">Cargando...</p>
      ) : debts.length === 0 ? (
        <div className="card text-center">
          <p>Aún no hay deudas registradas.</p>
          <p className="muted">Agrega el carro, la sala, el Play, el seguro… con el saldo de hoy y la cuota mensual.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {debts.map((d) => {
            const months = d.active && d.balance > 0 ? monthsToPayoff(d) : 0;
            const paidPct = d.original_amount ? Math.min(100, ((d.original_amount - d.balance) / d.original_amount) * 100) : 0;
            return (
              <div key={d.id} className={`card ${d.balance <= 0 ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="muted">
                      {[d.lender, d.owner].filter(Boolean).join(" · ")}
                      {d.monthly_rate ? ` · ${d.monthly_rate}% mes` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{money(d.balance)}</div>
                    <div className="muted">{money(d.monthly_payment)}/mes</div>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">
                    {d.balance <= 0
                      ? "🎉 ¡Pagada!"
                      : months === null
                        ? "La cuota no alcanza a cubrir los intereses"
                        : `Termina en ${monthLabel(addMonths(currentMonth(), months - 1), true)} (${months} cuotas)`}
                  </span>
                  <span className="flex gap-1">
                    {d.balance > 0 && (
                      <button className="btn-secondary px-2 py-1" onClick={() => pay(d)}>
                        ✓ Pagué la cuota
                      </button>
                    )}
                    <button className="btn-secondary px-2 py-1" onClick={() => edit(d)}>
                      Editar
                    </button>
                    <button className="btn-danger" onClick={() => remove(d)}>
                      ✕
                    </button>
                  </span>
                </div>
                {d.notes && <p className="muted mt-2">{d.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} placeholder={placeholder} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
