"use client";

import { useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/components/HouseholdProvider";
import MonthPicker from "@/components/MonthPicker";
import RecurringLoader from "@/components/RecurringLoader";
import { normalizeText, suggestPattern } from "@/lib/categorize";
import { fetchTransactions } from "@/lib/data";
import { monthRange, money } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { useMonth } from "@/lib/useMonth";

const today = () => new Date().toISOString().slice(0, 10);

export default function MovimientosPage() {
  const { supabase, household, categories, categoryById, people, me } = useHousehold();
  const [month, setMonth] = useMonth();
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("");
  const [personFilter, setPersonFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [showFixed, setShowFixed] = useState(false);
  const [ruleFor, setRuleFor] = useState<{ tx: Transaction; categoryId: string; pattern: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sin")) setCatFilter("__none");
    if (params.get("cat")) setCatFilter(params.get("cat")!);
  }, []);

  async function load() {
    const { start, end } = monthRange(month);
    setTxs(await fetchTransactions(supabase, household.id, start, end));
  }
  useEffect(() => {
    setTxs(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const filtered = useMemo(() => {
    if (!txs) return [];
    const q = normalizeText(search);
    return txs.filter(
      (t) =>
        (!q || normalizeText(t.description).includes(q)) &&
        (!personFilter || t.person === personFilter) &&
        (!catFilter || (catFilter === "__none" ? !t.category_id : t.category_id === catFilter)),
    );
  }, [txs, search, catFilter, personFilter]);

  const totals = useMemo(() => {
    let gastos = 0,
      ingresos = 0;
    for (const t of filtered) {
      if (categoryById.get(t.category_id ?? "")?.kind === "excluido") continue;
      if (t.type === "gasto") gastos += t.amount;
      else ingresos += t.amount;
    }
    return { gastos, ingresos };
  }, [filtered, categoryById]);

  async function changeCategory(tx: Transaction, categoryId: string) {
    await supabase.from("transactions").update({ category_id: categoryId || null }).eq("id", tx.id);
    setTxs((list) => list?.map((t) => (t.id === tx.id ? { ...t, category_id: categoryId || null } : t)) ?? null);
    if (categoryId) setRuleFor({ tx, categoryId, pattern: suggestPattern(tx.description) });
  }

  async function saveRule() {
    if (!ruleFor || ruleFor.pattern.trim().length < 3) return;
    const pattern = normalizeText(ruleFor.pattern);
    await supabase
      .from("category_rules")
      .upsert({ household_id: household.id, pattern, category_id: ruleFor.categoryId }, { onConflict: "household_id,pattern" });
    // Aplica la regla a los movimientos sin categoría que coincidan (de cualquier mes)
    const { data: pending } = await supabase
      .from("transactions")
      .select("id,description")
      .eq("household_id", household.id)
      .is("category_id", null)
      .ilike("description", `%${ruleFor.pattern.trim()}%`);
    const ids = (pending ?? []).filter((p) => normalizeText(p.description).includes(pattern)).map((p) => p.id);
    if (ids.length) await supabase.from("transactions").update({ category_id: ruleFor.categoryId }).in("id", ids);
    setRuleFor(null);
    load();
  }

  async function changePerson(tx: Transaction, person: string) {
    await supabase.from("transactions").update({ person }).eq("id", tx.id);
    setTxs((list) => list?.map((t) => (t.id === tx.id ? { ...t, person } : t)) ?? null);
  }

  async function remove(tx: Transaction) {
    if (!confirm(`¿Borrar "${tx.description}"?`)) return;
    await supabase.from("transactions").delete().eq("id", tx.id);
    setTxs((list) => list?.filter((t) => t.id !== tx.id) ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Movimientos</h1>
          <p className="muted">Todos los gastos e ingresos del mes. Cambia la categoría directamente en la tabla.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <button className="btn-secondary" onClick={() => setShowFixed(!showFixed)}>
            📌 Gastos fijos del mes
          </button>
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            ＋ Agregar manual
          </button>
        </div>
      </div>

      {showForm && (
        <ManualForm
          defaultPerson={me?.display_name ?? "Familia"}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {showFixed && txs && (
        <RecurringLoader
          month={month}
          txs={txs}
          onSaved={() => {
            setShowFixed(false);
            load();
          }}
        />
      )}

      {ruleFor && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm">
          <p>
            ¿Quieres que de ahora en adelante todo lo que contenga este texto se clasifique como{" "}
            <b>{categoryById.get(ruleFor.categoryId)?.name}</b>?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="input max-w-xs py-1"
              value={ruleFor.pattern}
              onChange={(e) => setRuleFor({ ...ruleFor, pattern: e.target.value })}
            />
            <button className="btn py-1" onClick={saveRule}>
              Sí, crear regla
            </button>
            <button className="btn-secondary py-1" onClick={() => setRuleFor(null)}>
              No, sólo este
            </button>
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="🔎 Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">Todas las categorías</option>
            <option value="__none">⚠️ Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
            <option value="">Todas las personas</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="text-sm">
          {filtered.length} movimientos · Gastos <b>{money(totals.gastos)}</b> · Ingresos{" "}
          <b className="text-emerald-700">{money(totals.ingresos)}</b>
        </div>

        {!txs ? (
          <p className="muted">Cargando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th className="text-right">Valor</th>
                  <th>Categoría</th>
                  <th>Persona</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const cat = categoryById.get(t.category_id ?? "");
                  return (
                    <tr key={t.id} className={cat?.kind === "excluido" ? "text-slate-400" : ""}>
                      <td className="whitespace-nowrap">{t.date}</td>
                      <td>
                        <div>{t.description}</div>
                        <div className="text-xs text-slate-400">
                          {t.account}
                          {t.installments && t.installments !== "1/1" ? ` · cuota ${t.installments}` : ""}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap text-right font-medium ${t.type === "ingreso" ? "text-emerald-700" : ""}`}>
                        {t.type === "ingreso" ? "+" : ""}
                        {money(t.amount)}
                      </td>
                      <td>
                        <select
                          className={`input min-w-40 py-1 ${!t.category_id || categoryById.get(t.category_id)?.name === "Por verificar" ? "border-amber-400 bg-amber-50" : ""}`}
                          value={t.category_id ?? ""}
                          onChange={(e) => changeCategory(t, e.target.value)}
                        >
                          <option value="">— Sin categoría —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="input py-1" value={t.person} onChange={(e) => changePerson(t, e.target.value)}>
                          {[...new Set([...people, t.person])].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button className="btn-danger" onClick={() => remove(t)} title="Borrar">
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="muted py-6 text-center">No hay movimientos con estos filtros.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ManualForm({ defaultPerson, onSaved }: { defaultPerson: string; onSaved: () => void }) {
  const { supabase, household, categories, people } = useHousehold();
  const [type, setType] = useState<"gasto" | "ingreso">("ingreso");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [person, setPerson] = useState(defaultPerson);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (!value) return setError("Escribe un valor");
    const { error } = await supabase.from("transactions").insert({
      household_id: household.id,
      date,
      description,
      amount: value,
      type,
      category_id: categoryId || null,
      person,
      account: "Manual",
    });
    if (error) setError(error.message);
    else onSaved();
  }

  const cats = categories.filter((c) => (type === "ingreso" ? c.kind !== "gasto" : c.kind !== "ingreso"));

  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <p className="muted">
          Úsalo para salarios, transferencias, pagos en efectivo o cosas que no salen en el extracto (ej: arriendo pagado por
          transferencia).
        </p>
      </div>
      <div>
        <label className="label">Tipo</label>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as "gasto" | "ingreso")}>
          <option value="ingreso">Ingreso</option>
          <option value="gasto">Gasto</option>
        </select>
      </div>
      <div>
        <label className="label">Fecha</label>
        <input className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="lg:col-span-2">
        <label className="label">Descripción</label>
        <input className="input" required placeholder="Ej: Salario septiembre" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label">Valor (COP)</label>
        <input className="input" inputMode="numeric" required placeholder="2.000.000" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div>
        <label className="label">Categoría</label>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— Sin categoría —</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Persona</label>
        <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button className="btn w-full">Guardar</button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}
    </form>
  );
}
