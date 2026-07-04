import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, todayISODate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  Package,
  Users,
  Truck,
  CreditCard,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

export const RouteAlias = null;

function Dashboard() {
  const { profile, isAdmin, user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      const startToday = todayISODate();

      let vendasQ = supabase
        .from("vendas")
        .select("id, valor_total, status")
        .gte("criado_em", startToday)
        .neq("status", "cancelada");
      if (!isAdmin && user) vendasQ = vendasQ.eq("vendedor_id", user.id);
      const [{ data: vendasHoje }, { data: baixo }, { data: fiado }] = await Promise.all([
        vendasQ,
        supabase.from("produtos").select("id, nome, quantidade, estoque_minimo"),
        supabase.from("clientes").select("id, nome, saldo_devedor").gt("saldo_devedor", 0),
      ]);
      const totalHoje = (vendasHoje ?? []).reduce((s, v) => s + Number(v.valor_total), 0);
      const estoqueBaixo = (baixo ?? []).filter((p) => p.quantidade <= p.estoque_minimo);
      return {
        vendasCount: vendasHoje?.length ?? 0,
        totalHoje,
        estoqueBaixo: estoqueBaixo.length,
        estoqueBaixoLista: estoqueBaixo.slice(0, 5),
        clientesDevendo: fiado?.length ?? 0,
        clientesFiadoLista: (fiado ?? []).slice(0, 5),
      };
    },
  });

  const cards = [
    { to: "/vendas", label: "Vendas", icon: ShoppingCart, color: "bg-primary/10 text-primary" },
    { to: "/estoque", label: "Estoque", icon: Package, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    { to: "/clientes", label: "Clientes", icon: Users, color: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
    { to: "/fornecedores", label: "Fornecedores", icon: Truck, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    { to: "/fiado", label: "Fiado", icon: CreditCard, color: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400" },
    ...(isAdmin ? [{ to: "/financeiro", label: "Financeiro", icon: Wallet, color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {profile?.nome?.split(" ")[0] ?? "vendedor"} 👋</h1>
        <p className="text-muted-foreground">
          {isAdmin ? "Resumo geral da loja hoje." : "Resumo das suas vendas hoje."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={isAdmin ? "Vendas hoje" : "Suas vendas hoje"}
          value={String(stats?.vendasCount ?? 0)}
          icon={ShoppingCart}
        />
        <StatCard
          label={isAdmin ? "Total vendido" : "Você vendeu"}
          value={formatBRL(stats?.totalHoje ?? 0)}
          icon={TrendingUp}
        />
        <StatCard
          label="Estoque baixo"
          value={String(stats?.estoqueBaixo ?? 0)}
          icon={AlertTriangle}
          tone={stats && stats.estoqueBaixo > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Clientes devendo"
          value={String(stats?.clientesDevendo ?? 0)}
          icon={CreditCard}
          tone={stats && stats.clientesDevendo > 0 ? "warning" : undefined}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Acesso rápido</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.to}
                to={c.to}
                className="group flex flex-col items-start gap-3 rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium">{c.label}</span>
                  <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Produtos com estoque baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.estoqueBaixoLista.length ? (
              <ul className="divide-y">
                {stats.estoqueBaixoLista.map((p) => (
                  <li key={p.id} className="py-2 flex justify-between text-sm">
                    <span>{p.nome}</span>
                    <span className="font-medium text-destructive">
                      {p.quantidade} un (mín. {p.estoque_minimo})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum produto com estoque baixo.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-warning" /> Clientes com saldo devedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.clientesFiadoLista.length ? (
              <ul className="divide-y">
                {stats.clientesFiadoLista.map((c) => (
                  <li key={c.id} className="py-2 flex justify-between text-sm">
                    <span>{c.nome}</span>
                    <span className="font-medium">{formatBRL(c.saldo_devedor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum cliente devendo. 🎉</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingCart;
  tone?: "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "bg-warning/20 text-warning-foreground"
      : tone === "success"
        ? "bg-success/20 text-success-foreground"
        : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
