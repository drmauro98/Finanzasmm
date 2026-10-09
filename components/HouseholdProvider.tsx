"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Category, Member } from "@/lib/types";
import Onboarding from "./Onboarding";

interface Household {
  id: string;
  name: string;
  invite_code: string;
}

interface Ctx {
  supabase: ReturnType<typeof createClient>;
  user: User;
  household: Household;
  members: Member[];
  me: Member | undefined;
  categories: Category[];
  categoryById: Map<string, Category>;
  /** Nombres para el campo "persona": cada miembro + "Familia" */
  people: string[];
  reload: () => Promise<void>;
}

const HouseholdContext = createContext<Ctx | null>(null);

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold debe usarse dentro de HouseholdProvider");
  return ctx;
}

export default function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<"loading" | "onboarding" | "ready">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const reload = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setUser(user);
    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      setState("onboarding");
      return;
    }
    const hid = membership.household_id;
    const [h, m, c] = await Promise.all([
      supabase.from("households").select("id,name,invite_code").eq("id", hid).single(),
      supabase.from("household_members").select("user_id,display_name").eq("household_id", hid).order("created_at"),
      supabase.from("categories").select("*").eq("household_id", hid).order("name"),
    ]);
    setHousehold(h.data);
    setMembers(m.data ?? []);
    setCategories((c.data ?? []).map((x) => ({ ...x, monthly_budget: Number(x.monthly_budget) })));
    setState("ready");
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (state === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Cargando...</div>;
  }
  if (state === "onboarding" || !household || !user) {
    return <Onboarding supabase={supabase} onDone={reload} />;
  }

  const value: Ctx = {
    supabase,
    user,
    household,
    members,
    me: members.find((m) => m.user_id === user.id),
    categories,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    people: [...members.map((m) => m.display_name), "Familia"],
    reload,
  };
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}
