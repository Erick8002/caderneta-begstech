import { useState, type ReactNode } from "react";
import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  CreditCard,
  Wallet,
  LogOut,
  Menu,
  X,
  Store,
  UserCheck,
  Bell,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart },
  { to: "/estoque", label: "Estoque", icon: Package },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/fornecedores", label: "Fornecedores", icon: Truck },
  { to: "/fiado", label: "Fiado", icon: CreditCard },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, adminOnly: true },
  { to: "/admin/aprovacoes", label: "Aprovações", icon: UserCheck, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, isAdmin, isApproved, approvalStatus, loading } = useAuth();
  const router = useRouter();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  const { data: pendentes = 0 } = useQuery({
    queryKey: ["aprovacoes-pendentes-count", isAdmin],
    enabled: isAdmin,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("solicitacoes_vendedor")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (!loading && !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg">
          <CardContent className="p-6 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
              <Clock className="h-6 w-6 text-warning-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Acesso aguardando aprovação</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Sua conta foi criada, mas um administrador precisa aprovar seu acesso como vendedor
                antes de usar o sistema.
              </p>
              {approvalStatus === "rejeitado" && (
                <p className="text-sm text-destructive mt-3">
                  Seu acesso foi rejeitado. Fale com o administrador da loja.
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-64 flex-col bg-sidebar text-sidebar-foreground">
        <SidebarInner items={items} pathname={location.pathname} pendentes={pendentes} />
      </aside>

      {/* Drawer mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-sidebar text-sidebar-foreground flex flex-col">
            <button
              className="absolute top-3 right-3 text-sidebar-foreground"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarInner
              items={items}
              pathname={location.pathname}
              pendentes={pendentes}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 -ml-2"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="md:hidden flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <span className="font-semibold">BEGSTech</span>
            </div>
            {isAdmin && pendentes > 0 && (
              <Link to="/admin/aprovacoes" className="hidden sm:inline-flex">
                <Button variant="outline" size="sm" className="gap-2">
                  <Bell className="h-4 w-4" /> {pendentes} aprovação{pendentes > 1 ? "ões" : ""}
                </Button>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!loading && profile && (
              <>
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-sm font-medium">{profile.nome}</span>
                  <span className="text-xs text-muted-foreground">{profile.email}</span>
                </div>
                <Badge variant={role === "admin" ? "default" : "secondary"}>
                  {role === "admin" ? "Administrador" : "Vendedor"}
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-1" /> Sair
                </Button>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function SidebarInner({
  items,
  pathname,
  pendentes,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  pendentes?: number;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="h-16 flex items-center gap-3 px-5 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
          <Store className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <div className="font-semibold leading-tight">BEGSTech</div>
          <div className="text-xs opacity-70">Caderneta Digital</div>
        </div>
      </div>
      <nav className="flex-1 py-4 px-2 space-y-1">
        {items.map((item) => {
          const active =
            item.to === "/dashboard"
              ? pathname === "/" || pathname === "/dashboard"
              : pathname.startsWith(item.to);
          const Icon = item.icon;
          const showPending = item.to === "/admin/aprovacoes" && !!pendentes;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {showPending && <Badge variant="destructive">{pendentes}</Badge>}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-xs opacity-70 border-t border-sidebar-border">
        © BEGSTech {new Date().getFullYear()}
      </div>
    </>
  );
}
