import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Pencil, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  component: ClienteDetalhes,
});

function ClienteDetalhes() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [openLimite, setOpenLimite] = useState(false);

  const { data } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      const [cli, vendas, pagos] = await Promise.all([
        supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("vendas")
          .select("id, criado_em, valor_total, forma_pagamento, status")
          .eq("cliente_id", id)
          .order("criado_em", { ascending: false }),
        supabase
          .from("pagamentos_fiado")
          .select("id, valor_pago, data_pagamento, observacao")
          .eq("cliente_id", id)
          .order("data_pagamento", { ascending: false }),
      ]);
      if (cli.error) throw cli.error;
      return { cliente: cli.data, vendas: vendas.data ?? [], pagamentos: pagos.data ?? [] };
    },
  });

  const alterarLimite = useMutation({
    mutationFn: async (novoLimite: number) => {
      const { error } = await supabase.rpc("alterar_limite_fiado", {
        p_cliente_id: id,
        p_novo_limite: novoLimite,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite atualizado");
      qc.invalidateQueries({ queryKey: ["cliente", id] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpenLimite(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.cliente) return <div>Carregando…</div>;
  const c = data.cliente;
  const disponivel = Number(c.limite_fiado) - Number(c.saldo_devedor);

  return (
    <div className="space-y-4">
      <Link
        to="/clientes"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Clientes
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{c.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {c.telefone ?? "sem telefone"} · CPF: {c.cpf ?? "não informado"} · Desde{" "}
            {formatDate(c.criado_em)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniCard label="Compras" value={String(c.qtd_compras)} />
        <MiniCard label="Limite fiado" value={formatBRL(c.limite_fiado)} />
        <MiniCard
          label="Saldo devedor"
          value={formatBRL(c.saldo_devedor)}
          tone={Number(c.saldo_devedor) > 0 ? "warning" : undefined}
        />
        <MiniCard label="Fiado disponível" value={formatBRL(disponivel)} />
      </div>

      {isAdmin && (
        <div>
          <Dialog open={openLimite} onOpenChange={setOpenLimite}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" /> Alterar limite de fiado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo limite de fiado</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const v = Number(f.get("limite"));
                  if (Number.isNaN(v) || v < 0) return toast.error("Valor inválido");
                  alterarLimite.mutate(v);
                }}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    name="limite"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={Number(c.limite_fiado)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={alterarLimite.isPending}>
                    Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Histórico de compras
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.vendas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma compra registrada.</p>
            ) : (
              <ul className="divide-y">
                {data.vendas.map((v) => (
                  <li key={v.id} className="flex items-center justify-between p-3">
                    <div>
                      <Link
                        to="/vendas/$id"
                        params={{ id: v.id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {formatDateTime(v.criado_em)}
                      </Link>
                      <div className="text-xs text-muted-foreground uppercase">
                        {v.forma_pagamento}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{formatBRL(v.valor_total)}</div>
                      <StatusBadge status={v.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamentos de fiado</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.pagamentos.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            ) : (
              <ul className="divide-y">
                {data.pagamentos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <div>{formatDateTime(p.data_pagamento)}</div>
                      {p.observacao && (
                        <div className="text-xs text-muted-foreground">{p.observacao}</div>
                      )}
                    </div>
                    <div className="font-medium text-success">{formatBRL(p.valor_pago)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniCard({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-1 ${tone === "warning" ? "text-destructive" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paga") return <Badge className="bg-success text-success-foreground">Paga</Badge>;
  if (status === "fiada")
    return <Badge className="bg-warning text-warning-foreground">Fiada</Badge>;
  return <Badge variant="destructive">Cancelada</Badge>;
}
