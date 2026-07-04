import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vendas/$id")({
  component: VendaDetalhes,
});

function VendaDetalhes() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["venda", id],
    queryFn: async () => {
      const [v, itens] = await Promise.all([
        supabase.from("vendas").select("*, clientes(id, nome)").eq("id", id).maybeSingle(),
        supabase
          .from("itens_venda")
          .select("id, quantidade, valor_unitario, subtotal, produto_id, produtos(nome)")
          .eq("venda_id", id),
      ]);
      if (v.error) throw v.error;
      const vendedor = v.data
        ? (
            await supabase
              .from("profiles")
              .select("nome")
              .eq("id", v.data.vendedor_id)
              .maybeSingle()
          ).data
        : null;
      return { venda: v.data, itens: itens.data ?? [], vendedor };
    },
  });

  const cancelar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancelar_venda", { p_venda_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda cancelada e estoque devolvido");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.venda) return <div>Carregando…</div>;
  const v = data.venda;
  const totalItens = data.itens.reduce((acc, item) => {
    const quantidade = Number(item.quantidade ?? 0);
    const valorUnitario = Number(item.valor_unitario ?? 0);
    const subtotal = Number(item.subtotal ?? quantidade * valorUnitario);
    return acc + subtotal;
  }, 0);
  const totalVenda = Number(v.valor_total ?? 0) > 0 ? Number(v.valor_total) : totalItens;

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        to="/vendas"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Vendas
      </Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Venda #{id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(v.criado_em)}</p>
        </div>
        <div className="flex items-center gap-2">
          {v.status === "paga" && (
            <Badge className="bg-success text-success-foreground">Paga</Badge>
          )}
          {v.status === "fiada" && (
            <Badge className="bg-warning text-warning-foreground">Fiada</Badge>
          )}
          {v.status === "cancelada" && <Badge variant="destructive">Cancelada</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Info label="Cliente" value={v.clientes?.nome ?? "Sem cadastro"} />
        <Info label="Vendedor" value={data.vendedor?.nome ?? "-"} />
        <Info label="Pagamento" value={v.forma_pagamento.toUpperCase()} />
        <Info label="Total" value={formatBRL(totalVenda)} bold />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Qtd</TableHead>
                <TableHead>Unitário</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.produtos?.nome ?? "—"}</TableCell>
                  <TableCell>{i.quantidade}</TableCell>
                  <TableCell>{formatBRL(i.valor_unitario)}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(i.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && v.status !== "cancelada" && (
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm("Cancelar esta venda? O estoque será devolvido.")) cancelar.mutate();
          }}
          disabled={cancelar.isPending}
        >
          <XCircle className="h-4 w-4 mr-2" /> Cancelar venda
        </Button>
      )}
      <div>
        <Button variant="outline" onClick={() => navigate({ to: "/vendas" })}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

function Info({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 ${bold ? "text-lg font-bold" : "text-sm font-medium"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
