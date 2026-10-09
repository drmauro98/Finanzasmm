"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "./HouseholdProvider";
import type { RecurringItem } from "@/lib/types";

const num = (s: string) => Number(String(s).replace(/[^\d.]/g, "")) || 0;
const empty = { name: "", category_id: "", amount: "", percent: "", person: "" };

/** Administra los gastos fijos que se cargan cada mes desde Movimientos */
export default function RecurringSettings() {
  const { supabase, household, categories, people, me } = useHousehold();
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [form, setForm] = useState({ ...empty, person: me?.display_name ?? "Familia" });

  async function load() {
    const { data } = await supabase.from("recurring_items").select("*").eq("household_id", household.id).order("created_at");
    setItems(
      (data ?? []).map((i) => ({
        ...i,
        amount: Number(i.amount),
        percent_of_income: i.percent_of_income === null ? null : Number(i.percent_of_income),
      })),
    );
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("recurring_items").insert({
      household_id: household.id,
      name: form.name,
      category_id: form.category_id || null,
      amount: form.percent ? 0 : Math.round(num(form.amount)),
      percent_of_income: form.percent ? num(form.percent) : null,
      person: form.person,
    });
    setForm({ ...empty, person: form.person });
    load();
  }

  async function update(id: string, patch: Record<string, unknown>) {
    await supabase.from("recurring_items").update(patch).eq("id", id);
    load();
  }

  async function remove(item: RecurringItem) {
    if (!confirm(`¿Quitar "${item.name}" de los gastos fijos?`)) return;
    await supabase.from("recurring_items").delete().eq("id", item.id);
    load();
  }

  const expenseCats = categories.filter((c) => c.kind === "gasto" || c.kind === "ahorro");

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold">Gastos fijos del mes</h2>
      <p className="muted mb-4">
        Se cargan con un clic desde Movimientos → “📌 Gastos fijos del mes”. Usa porcentaje para el diezmo (10% de los
        ingresos).
      </p>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th className="text-right">Valor</th>
              <th className="text-right">% ingresos</th>
              <th>Persona</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  <select className="input py-1" value={i.category_id ?? ""} onChange={(e) => update(i.id, { category_id: e.target.value || null })}>
                    <option value="">—</option>
                    {expenseCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-right">
                  {i.percent_of_income ? (
                    "—"
                  ) : (
                    <input
                      className="input w-32 py-1 text-right"
                      defaultValue={Math.round(i.amount)}
                      inputMode="numeric"
                      onBlur={(e) => num(e.target.value) !== i.amount && update(i.id, { amount: Math.round(num(e.target.value)) })}
                    />
                  )}
                </td>
                <td className="text-right">{i.percent_of_income ? `${i.percent_of_income}%` : "—"}</td>
                <td>{i.person}</td>
                <td>
                  <input type="checkbox" checked={i.active} onChange={(e) => update(i.id, { active: e.target.checked })} />
                </td>
                <td>
                  <button className="btn-danger" onClick={() => remove(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={add} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto]">
        <input className="input" required placeholder="Nombre (ej: Arriendo)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input" required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">Categoría...</option>
          {expenseCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input w-32" placeholder="Valor" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input className="input w-24" placeholder="o %" inputMode="decimal" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
        <select className="input" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button className="btn">Agregar</button>
      </form>
    </div>
  );
}
