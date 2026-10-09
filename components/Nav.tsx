"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useHousehold } from "./HouseholdProvider";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/importar", label: "Importar extracto", icon: "📥" },
  { href: "/movimientos", label: "Movimientos", icon: "🧾" },
  { href: "/presupuesto", label: "Presupuesto", icon: "🎯" },
  { href: "/deudas", label: "Deudas", icon: "💳" },
  { href: "/ahorro", label: "Ahorro", icon: "🐷" },
  { href: "/proyecciones", label: "Proyecciones", icon: "🔮" },
  { href: "/configuracion", label: "Configuración", icon: "⚙️" },
];

export default function Nav() {
  const pathname = usePathname();
  const { supabase, household, me } = useHousehold();
  const [open, setOpen] = useState(false);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const links = (
    <nav className="space-y-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-emerald-50 font-medium text-emerald-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Barra superior en celular */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="font-semibold">💰 {household.name}</span>
        <button className="btn-secondary px-3 py-1" onClick={() => setOpen(!open)}>
          {open ? "Cerrar" : "Menú"}
        </button>
      </header>
      {open && (
        <div className="border-b border-slate-200 bg-white p-3 lg:hidden">
          {links}
          <button onClick={logout} className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100">
            ↩ Cerrar sesión
          </button>
        </div>
      )}

      {/* Barra lateral en computador */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
        <div className="mb-6 px-3">
          <div className="text-lg font-semibold">💰 {household.name}</div>
          <div className="muted">Hola, {me?.display_name}</div>
        </div>
        {links}
        <button onClick={logout} className="mt-auto rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100">
          ↩ Cerrar sesión
        </button>
      </aside>
    </>
  );
}
