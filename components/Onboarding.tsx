"use client";

import { useState } from "react";
import type { createClient } from "@/lib/supabase/client";

export default function Onboarding({
  supabase,
  onDone,
}: {
  supabase: ReturnType<typeof createClient>;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [familyName, setFamilyName] = useState("Familia M&M");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } =
      mode === "create"
        ? await supabase.rpc("create_household", { p_name: familyName, p_display_name: name })
        : await supabase.rpc("join_household", { p_code: code, p_display_name: name });
    setLoading(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="h1">¡Bienvenido! 👋</h1>
        <p className="muted mt-1">
          La primera persona crea la familia. La segunda se une con el código de invitación que aparece en Configuración.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-sm">
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md py-2 ${mode === m ? "bg-white font-medium shadow" : "text-slate-600"}`}
            >
              {m === "create" ? "Crear familia" : "Unirme con código"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="label">¿Cómo te llamamos?</label>
            <input className="input" required placeholder="Ej: Mao" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {mode === "create" ? (
            <div>
              <label className="label">Nombre de la familia</label>
              <input className="input" required value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="label">Código de invitación</label>
              <input className="input uppercase" required placeholder="Ej: 3F9A1C2B" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn w-full" disabled={loading}>
            {loading ? "Guardando..." : "Continuar"}
          </button>
        </form>
      </div>
    </main>
  );
}
