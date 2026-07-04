import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { Wallet, TrendingUp, Package, CreditCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/financeiro")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: FinanceiroPage,
});

function FinanceiroPage() {
  const [dataDe, setDataDe] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dataAte, setDataAte] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [formaFilter, setFormaFilter] = useState<string>("todas");
  const [vendedorFilter, setVendedorFilter] = useState<string>("todos");

  const { data: vendas = [] } = useQuery({
    queryKey: ["fin-vendas", dataDe, dataAte],
    queryFn: async () => {
      const de = new Date(dataDe);
      const ate = new Date(dataAte);
      ate.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("vendas")
        .select(
          "id, criado_em, valor_total, custo_total, lucro_total, forma_pagamento, status, vendedor_id, cliente_id",
        )
        .gte("criado_em", de.toISOString())
        .lte("criado_em", ate.toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: perfis = [] } = useQuery({
    queryKey: ["profiles-fin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      return data;
    },
  });
  const perfilMap = useMemo(() => Object.fromEntries(perfis.map((p) => [p.id, p.nome])), [perfis]);

  const { data: totalFiado = 0 } = useQuery({
    queryKey: ["fin-total-fiado"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("saldo_devedor");
      if (error) throw error;
      return (data ?? []).reduce((s, c) => s + Number(c.saldo_devedor), 0);
    },
  });

  const filtradas = vendas.filter((v) => {
    if (formaFilter !== "todas" && v.forma_pagamento !== formaFilter) return false;
    if (vendedorFilter !== "todos" && v.vendedor_id !== vendedorFilter) return false;
    return true;
  });

  const validas = filtradas.filter((v) => v.status !== "cancelada");
  const canceladas = filtradas.filter((v) => v.status === "cancelada");

  const totalVendido = validas.reduce((s, v) => s + Number(v.valor_total), 0);
  const custoTotal = validas.reduce((s, v) => s + Number(v.custo_total), 0);
  const lucroTotal = validas.reduce((s, v) => s + Number(v.lucro_total), 0);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vendasHoje = validas.filter((v) => new Date(v.criado_em) >= hoje);
  const totalHoje = vendasHoje.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucroHoje = vendasHoje.reduce((s, v) => s + Number(v.lucro_total), 0);

  const mesAtual = new Date();
  mesAtual.setDate(1);
  mesAtual.setHours(0, 0, 0, 0);
  const vendasMes = validas.filter((v) => new Date(v.criado_em) >= mesAtual);
  const totalMes = vendasMes.reduce((s, v) => s + Number(v.valor_total), 0);
  const lucroMes = vendasMes.reduce((s, v) => s + Number(v.lucro_total), 0);

  // Gráfico: vendas por dia
  const porDia = new Map<string, { data: string; total: number; lucro: number }>();
  for (const v of validas) {
    const key = new Date(v.criado_em).toISOString().slice(0, 10);
    const cur = porDia.get(key) ?? { data: key.slice(5), total: 0, lucro: 0 };
    cur.total += Number(v.valor_total);
    cur.lucro += Number(v.lucro_total);
    porDia.set(key, cur);
  }
  const chartDia = Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // Ranking vendedores
  const porVendedor = new Map<
    string,
    { nome: string; total: number; lucro: number; qtd: number }
  >();
  for (const v of validas) {
    const cur = porVendedor.get(v.vendedor_id) ?? {
      nome: perfilMap[v.vendedor_id] ?? "—",
      total: 0,
      lucro: 0,
      qtd: 0,
    };
    cur.total += Number(v.valor_total);
    cur.lucro += Number(v.lucro_total);
    cur.qtd += 1;
    porVendedor.set(v.vendedor_id, cur);
  }
  const ranking = Array.from(porVendedor.values()).sort((a, b) => b.total - a.total);

  // Por forma
  const porForma = new Map<string, number>();
  for (const v of validas)
    porForma.set(v.forma_pagamento, (porForma.get(v.forma_pagamento) ?? 0) + Number(v.valor_total));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Painel completo — apenas administrador</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Data inicial</Label>
            <Input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data final</Label>
            <Input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Forma de pagamento</Label>
            <Select value={formaFilter} onValueChange={setFormaFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="fiado">Fiado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendedor</Label>
            <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {perfis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Vendas hoje" value={formatBRL(totalHoje)} icon={TrendingUp} />
        <MetricCard label="Lucro hoje" value={formatBRL(lucroHoje)} icon={Wallet} />
        <MetricCard label="Vendas do mês" value={formatBRL(totalMes)} icon={TrendingUp} />
        <MetricCard label="Lucro do mês" value={formatBRL(lucroMes)} icon={Wallet} />
        <MetricCard
          label="Total em fiado"
          value={formatBRL(totalFiado)}
          icon={CreditCard}
          tone="warning"
        />
        <MetricCard label="Vendas no período" value={String(validas.length)} icon={Package} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Resumo do período</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Valor vendido" value={formatBRL(totalVendido)} />
            <Row label="Custos" value={formatBRL(custoTotal)} />
            <Row label="Lucro" value={formatBRL(lucroTotal)} strong />
            <Row label="Vendas canceladas" value={String(canceladas.length)} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Vendas e lucro por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartDia}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Vendas"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="lucro"
                    name="Lucro"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranking}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="total" name="Total vendido" fill="var(--color-chart-1)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 divide-y text-sm">
              {ranking.map((r) => (
                <li key={r.nome} className="flex justify-between py-1.5">
                  <span>
                    {r.nome} <span className="text-muted-foreground">({r.qtd})</span>
                  </span>
                  <span className="font-medium">{formatBRL(r.total)}</span>
                </li>
              ))}
              {ranking.length === 0 && (
                <li className="text-muted-foreground py-2">Sem dados no período.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(["dinheiro", "pix", "cartao", "fiado"] as const).map((f) => (
                <li key={f} className="flex justify-between py-2">
                  <span className="uppercase text-muted-foreground text-xs">{f}</span>
                  <span className="font-medium">{formatBRL(porForma.get(f) ?? 0)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone?: "warning";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold mt-1 ${tone === "warning" ? "text-destructive" : ""}`}>
              {value}
            </p>
          </div>
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
