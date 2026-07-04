import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

type FormaPagamento = "dinheiro" | "pix" | "cartao" | "fiado";

type FinanceiroResumo = {
  total_vendido: number;
  custo_total: number;
  lucro_total: number;
  total_fiado: number;
  vendas_periodo: number;
  vendas_canceladas: number;
  total_hoje: number;
  lucro_hoje: number;
  total_mes: number;
  lucro_mes: number;
};

type FinanceiroDados = {
  resumo: FinanceiroResumo;
  vendas_por_dia: Array<{ data: string; total: number; lucro: number }>;
  ranking_vendedores: Array<{
    vendedor_id: string;
    nome: string;
    total: number;
    lucro: number;
    qtd: number;
  }>;
  por_forma_pagamento: Array<{ forma: FormaPagamento; total: number }>;
  vendedores: Array<{ id: string; nome: string }>;
};

const resumoVazio: FinanceiroResumo = {
  total_vendido: 0,
  custo_total: 0,
  lucro_total: 0,
  total_fiado: 0,
  vendas_periodo: 0,
  vendas_canceladas: 0,
  total_hoje: 0,
  lucro_hoje: 0,
  total_mes: 0,
  lucro_mes: 0,
};

const financeiroVazio: FinanceiroDados = {
  resumo: resumoVazio,
  vendas_por_dia: [],
  ranking_vendedores: [],
  por_forma_pagamento: [
    { forma: "dinheiro", total: 0 },
    { forma: "pix", total: 0 },
    { forma: "cartao", total: 0 },
    { forma: "fiado", total: 0 },
  ],
  vendedores: [],
};

function FinanceiroPage() {
  const [dataDe, setDataDe] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dataAte, setDataAte] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [formaFilter, setFormaFilter] = useState<string>("todas");
  const [vendedorFilter, setVendedorFilter] = useState<string>("todos");

  const {
    data: financeiro = financeiroVazio,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["financeiro-admin", dataDe, dataAte, formaFilter, vendedorFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("financeiro_admin_dados", {
        p_data_inicio: dataDe || null,
        p_data_fim: dataAte || null,
        p_vendedor_id: vendedorFilter === "todos" ? null : vendedorFilter,
        p_forma_pagamento: formaFilter === "todas" ? null : formaFilter,
      });

      if (error) throw error;
      return normalizarFinanceiro(data as unknown);
    },
  });

  const resumo = financeiro.resumo;
  const chartDia = financeiro.vendas_por_dia;
  const ranking = financeiro.ranking_vendedores;
  const porForma = new Map(financeiro.por_forma_pagamento.map((f) => [f.forma, f.total]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Painel completo — apenas administrador</p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar o financeiro. Confirme se a migration
            <span className="font-mono"> 20260704130000_fix_financeiro_dashboard_rpc.sql </span>
            foi aplicada no Supabase. Erro: {String(error.message ?? error)}
          </CardContent>
        </Card>
      )}

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
                {financeiro.vendedores.map((p) => (
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
        <MetricCard label="Vendas hoje" value={formatBRL(resumo.total_hoje)} icon={TrendingUp} />
        <MetricCard label="Lucro hoje" value={formatBRL(resumo.lucro_hoje)} icon={Wallet} />
        <MetricCard label="Vendas do mês" value={formatBRL(resumo.total_mes)} icon={TrendingUp} />
        <MetricCard label="Lucro do mês" value={formatBRL(resumo.lucro_mes)} icon={Wallet} />
        <MetricCard
          label="Total em fiado"
          value={formatBRL(resumo.total_fiado)}
          icon={CreditCard}
          tone="warning"
        />
        <MetricCard
          label="Vendas no período"
          value={String(resumo.vendas_periodo)}
          icon={Package}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Resumo do período</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row label="Valor vendido" value={formatBRL(resumo.total_vendido)} />
            <Row label="Custos" value={formatBRL(resumo.custo_total)} />
            <Row label="Lucro" value={formatBRL(resumo.lucro_total)} strong />
            <Row label="Vendas canceladas" value={String(resumo.vendas_canceladas)} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Vendas e lucro por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartBox empty={!isLoading && chartDia.length === 0}>
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
            </ChartBox>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartBox empty={!isLoading && ranking.length === 0}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranking}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="total" name="Total vendido" fill="var(--color-chart-1)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            <ul className="mt-3 divide-y text-sm">
              {ranking.map((r) => (
                <li key={r.vendedor_id} className="flex justify-between py-1.5">
                  <span>
                    {r.nome} <span className="text-muted-foreground">({r.qtd})</span>
                  </span>
                  <span className="font-medium">{formatBRL(r.total)}</span>
                </li>
              ))}
              {ranking.length === 0 && (
                <li className="text-muted-foreground py-2">
                  {isLoading ? "Carregando..." : "Sem dados no período."}
                </li>
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

function normalizarFinanceiro(data: unknown): FinanceiroDados {
  if (!data || typeof data !== "object") return financeiroVazio;

  const d = data as Partial<FinanceiroDados>;
  const resumo = { ...resumoVazio, ...(d.resumo ?? {}) };

  return {
    resumo: {
      total_vendido: Number(resumo.total_vendido ?? 0),
      custo_total: Number(resumo.custo_total ?? 0),
      lucro_total: Number(resumo.lucro_total ?? 0),
      total_fiado: Number(resumo.total_fiado ?? 0),
      vendas_periodo: Number(resumo.vendas_periodo ?? 0),
      vendas_canceladas: Number(resumo.vendas_canceladas ?? 0),
      total_hoje: Number(resumo.total_hoje ?? 0),
      lucro_hoje: Number(resumo.lucro_hoje ?? 0),
      total_mes: Number(resumo.total_mes ?? 0),
      lucro_mes: Number(resumo.lucro_mes ?? 0),
    },
    vendas_por_dia: (d.vendas_por_dia ?? []).map((item) => ({
      data: String(item.data),
      total: Number(item.total ?? 0),
      lucro: Number(item.lucro ?? 0),
    })),
    ranking_vendedores: (d.ranking_vendedores ?? []).map((item) => ({
      vendedor_id: String(item.vendedor_id),
      nome: String(item.nome ?? "—"),
      total: Number(item.total ?? 0),
      lucro: Number(item.lucro ?? 0),
      qtd: Number(item.qtd ?? 0),
    })),
    por_forma_pagamento: (d.por_forma_pagamento ?? financeiroVazio.por_forma_pagamento).map(
      (item) => ({
        forma: item.forma,
        total: Number(item.total ?? 0),
      }),
    ),
    vendedores: (d.vendedores ?? []).map((item) => ({
      id: String(item.id),
      nome: String(item.nome ?? "—"),
    })),
  };
}

function ChartBox({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  return (
    <div className="h-64">
      {empty ? (
        <div className="h-full rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground text-center px-4">
          Sem dados no período selecionado.
        </div>
      ) : (
        children
      )}
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
