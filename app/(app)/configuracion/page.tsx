"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/components/HouseholdProvider";
import { normalizeText } from "@/lib/categorize";
import { money } from "@/lib/format";
import type { CategoryKind, Rule } from "@/lib/types";

const KIND_LABEL: Record<CategoryKind, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  ahorro: "Ahorro",
  excluido: "No cuenta (pagos de tarjeta, negocio)",
};

interface ImportRow {
  id: string;
  file_name: string;
  account: string;
  person: string;
  rows_imported: number;
  created_at: string;
}

export default function ConfiguracionPage() {
  const { supabase, household, me, user, members, categories, categoryById, reload } = useHousehold();
  const [rules, setRules] = useState<Rule[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [myName, setMyName] = useState(me?.display_name ?? "");
  const [newCat, setNewCat] = useState({ name: "", kind: "gasto" as CategoryKind, color: "#64748b" });
  const [newRule, setNewRule] = useState({ pattern: "", category_id: "" });
  const [ruleSearch, setRuleSearch] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadExtras() {
    const [r, i] = await Promise.all([
      supabase.from("category_rules").select("id,pattern,category_id").eq("household_id", household.id).order("pattern"),
      supabase
        .from("imports")
        .select("id,file_name,account,person,rows_imported,created_at")
        .eq("household_id", household.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setRules(r.data ?? []);
    setImports(i.data ?? []);
  }
  useEffect(() => {
    loadExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveName() {
    await supabase.from("household_members").update({ display_name: myName }).eq("household_id", household.id).eq("user_id", user.id);
    reload();
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("categories").insert({ household_id: household.id, ...newCat });
    if (error) return alert(error.message);
    setNewCat({ name: "", kind: "gasto", color: "#64748b" });
    reload();
  }

  async function updateCategory(id: string, patch: Record<string, unknown>) {
    await supabase.from("categories").update(patch).eq("id", id);
    reload();
  }

  async function deleteCategory(id: string, name: string) {
    if (!confirm(`¿Borrar la categoría "${name}"? Los movimientos quedarán "sin categoría".`)) return;
    await supabase.from("categories").delete().eq("id", id);
    reload();
    loadExtras();
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRule.category_id || newRule.pattern.trim().length < 2) return;
    await supabase
      .from("category_rules")
      .upsert(
        { household_id: household.id, pattern: normalizeText(newRule.pattern), category_id: newRule.category_id },
        { onConflict: "household_id,pattern" },
      );
    setNewRule({ pattern: "", category_id: "" });
    loadExtras();
  }

  async function deleteRule(id: string) {
    await supabase.from("category_rules").delete().eq("id", id);
    setRules((r) => r.filter((x) => x.id !== id));
  }

  async function undoImport(imp: ImportRow) {
    if (!confirm(`¿Deshacer la importación de "${imp.file_name}"? Se borrarán sus ${imp.rows_imported} movimientos.`)) return;
    await supabase.from("imports").delete().eq("id", imp.id);
    loadExtras();
  }

  const visibleRules = rules.filter(
    (r) =>
      !ruleSearch ||
      r.pattern.includes(normalizeText(ruleSearch)) ||
      normalizeText(categoryById.get(r.category_id)?.name ?? "").includes(normalizeText(ruleSearch)),
  );

  return (
    <div className="space-y-6">
      <h1 className="h1">Configuración</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">Invitar a mi pareja</h2>
          <p className="muted">
            Tu pareja debe crear su cuenta en esta misma página, elegir “Unirme con código” y escribir este código:
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded-lg bg-slate-100 px-4 py-2 text-xl font-bold tracking-widest">{household.invite_code}</code>
            <button
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard?.writeText(household.invite_code);
                setCopied(true);
              }}
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="muted">Miembros: {members.map((m) => m.display_name).join(", ")}</p>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold">Mi nombre</h2>
          <div className="flex gap-2">
            <input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} />
            <button className="btn" onClick={saveName}>
              Guardar
            </button>
          </div>
          <p className="muted">Así apareces en los movimientos y en “¿Quién gastó?”.</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Categorías</h2>
        <p className="muted mb-4">
          Las categorías “No cuenta” sirven para pagos de la tarjeta o gastos de la agencia: se guardan pero no suman en los
          gastos de la familia.
        </p>
        <form onSubmit={addCategory} className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input
            className="input"
            placeholder="Nueva categoría (ej: Mascotas)"
            required
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
          />
          <select className="input" value={newCat.kind} onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as CategoryKind })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="color"
            className="h-10 w-14 rounded-lg border border-slate-300"
            value={newCat.color}
            onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
          />
          <button className="btn">Agregar</button>
        </form>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Color</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th className="text-right">Presupuesto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="color"
                      className="h-8 w-10 rounded border border-slate-200"
                      defaultValue={c.color}
                      onBlur={(e) => e.target.value !== c.color && updateCategory(c.id, { color: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input py-1"
                      defaultValue={c.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && updateCategory(c.id, { name: e.target.value.trim() })}
                    />
                  </td>
                  <td>
                    <select className="input py-1" value={c.kind} onChange={(e) => updateCategory(c.id, { kind: e.target.value })}>
                      {Object.entries(KIND_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap text-right">{c.kind === "gasto" ? money(c.monthly_budget) : "—"}</td>
                  <td>
                    <button className="btn-danger" onClick={() => deleteCategory(c.id, c.name)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Reglas automáticas</h2>
        <p className="muted mb-4">
          Si la descripción del movimiento contiene el texto, se le asigna la categoría. Ej: “JUAN VALDEZ” → Onces / Café.
        </p>
        <form onSubmit={addRule} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className="input"
            placeholder="Texto que contiene (ej: TERPEL)"
            value={newRule.pattern}
            onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
          />
          <select className="input" value={newRule.category_id} onChange={(e) => setNewRule({ ...newRule, category_id: e.target.value })}>
            <option value="">Categoría...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="btn">Agregar regla</button>
        </form>
        <input className="input mb-3" placeholder="🔎 Buscar regla" value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} />
        <div className="max-h-96 overflow-y-auto">
          <table className="table">
            <tbody>
              {visibleRules.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.pattern}</td>
                  <td>→ {categoryById.get(r.category_id)?.name ?? "?"}</td>
                  <td className="text-right">
                    <button className="btn-danger" onClick={() => deleteRule(r.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">Importaciones recientes</h2>
        <p className="muted mb-4">Si te equivocaste subiendo un extracto, puedes deshacerlo aquí.</p>
        {imports.length === 0 ? (
          <p className="muted">Aún no has importado extractos.</p>
        ) : (
          <table className="table">
            <tbody>
              {imports.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{new Date(i.created_at).toLocaleDateString("es-CO")}</td>
                  <td>
                    {i.file_name}
                    <div className="text-xs text-slate-400">
                      {i.account} · {i.person} · {i.rows_imported} movimientos
                    </div>
                  </td>
                  <td className="text-right">
                    <button className="btn-danger" onClick={() => undoImport(i)}>
                      Deshacer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
