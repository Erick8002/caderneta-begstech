import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "vendedor";

export interface Profile {
  id: string;
  nome: string;
  email: string;
}

export interface AuthState {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  isAdmin: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadRoleAndProfile(u: User | null) {
      if (!u) {
        if (mounted) {
          setProfile(null);
          setRole(null);
        }
        return;
      }
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, nome, email").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id),
      ]);
      if (!mounted) return;
      setProfile(profileRes.data ?? null);
      const roles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
      setRole(roles.includes("admin") ? "admin" : roles.includes("vendedor") ? "vendedor" : null);
    }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      loadRoleAndProfile(u).finally(() => mounted && setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      loadRoleAndProfile(u);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    loading,
    user,
    profile,
    role,
    isAdmin: role === "admin",
  };
}
