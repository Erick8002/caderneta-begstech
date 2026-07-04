import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function requireAdmin() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw redirect({ to: "/auth" });
  }

  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError) {
    throw roleError;
  }

  const isAdmin = (roles ?? []).some((item) => item.role === "admin");

  if (!isAdmin) {
    throw redirect({ to: "/dashboard" });
  }
}
