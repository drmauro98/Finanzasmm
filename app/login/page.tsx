"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ kind: "error", text: "Correo o contraseña incorrectos." });
      else {
        router.replace("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) setMessage({ kind: "error", text: error.message });
      else if (data.session) {
        router.replace("/");
        router.refresh();
      } else setMessage({ kind: "ok", text: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí." });
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-4xl">💰</div>
          <h1 className="h1 mt-2">Finanzas M&amp;M</h1>
          <p className="muted">Nuestro dashboard familiar</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {message && (
            <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>
          )}
          <button className="btn w-full" disabled={loading}>
            {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-emerald-700 hover:underline"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "¿Primera vez? Crea tu cuenta" : "¿Ya tienes cuenta? Entra"}
        </button>
      </div>
    </main>
  );
}
