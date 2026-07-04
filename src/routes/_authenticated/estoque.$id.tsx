import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ArrowLeft, AlertTriangle, PackagePlus } from "lucide-react";
import { ProductImage } from "@/components/product-image";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estoque/$id")({
  component: ProdutoDetalhes,
});

function ProdutoDetalhes() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["produto", id],
    queryFn: async () => {
      const [prod, itens] = await Promise.all([
        supabase.from("produtos").select("*, fornecedores(id, nome)").eq("id", id).maybeSingle(),
        supabase
          .from("itens_venda")
          .select("id, quantidade, subtotal, venda_id, vendas(criado_em, status)")
          .eq("produto_id", id)
          .order("id", { ascending: false })
          .limit(30),
      ]);
      if (prod.error) throw prod.error;
      return { produto: prod.data, itens: itens.data ?? [] };
    },
  });

  const receberEstoque = useMutation({
    mutationFn: async (payload: {
      quantidade: number;
      valor_custo: number | null;
      atualizar_custo: boolean;
    }) => {
      const { error } = await supabase.rpc("receber_estoque_produto", {
        p_produto_id: id,
        p_quantidade: payload.quantidade,
        p_valor_custo: payload.valor_custo,
        p_atualizar_custo: payload.atualizar_custo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estoque recebido");
      qc.invalidateQueries({ queryKey: ["produto", id] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.produto) return <div>Carregando…</div>;
  const p = data.produto;
  const validas = data.itens.filter((i) => i.vendas?.status !== "cancelada");
  const qtdVendida = validas.reduce((s, i) => s + i.quantidade, 0);
  const saidaMedia = validas.length ? qtdVendida / validas.length : 0;
  const lucroUnit = Number(p.valor_venda) - Number(p.valor_custo);
  const baixo = p.quantidade <= p.estoque_minimo;

  return (
    <div className="space-y-4">
      <Link
        to="/estoque"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Estoque
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 overflow-hidden rounded-2xl border bg-muted/40">
            <ProductImage src={p.foto_url} alt={p.nome} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{p.nome}</h1>
              {baixo && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Estoque baixo
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              SKU: {p.sku ?? "-"} · Categoria: {p.categoria ?? "-"} · Fornecedor:{" "}
              {p.fornecedores ? (
                isAdmin ? (
                  <Link
                    to="/fornecedores/$id"
                    params={{ id: p.fornecedores.id }}
                    className="underline"
                  >
                    {p.fornecedores.nome}
                  </Link>
                ) : (
                  p.fornecedores.nome
                )
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <PackagePlus className="h-4 w-4 mr-2" /> Receber estoque
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Receber estoque</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const quantidade = Number(f.get("quantidade"));
                  const custoRaw = String(f.get("valor_custo") ?? "").trim();
                  const valorCusto = custoRaw === "" ? null : Number(custoRaw);
                  const atualizarCusto = f.get("atualizar_custo") === "on";

                  if (Number.isNaN(quantidade) || quantidade <= 0)
                    return toast.error("Quantidade inválida");
                  if (valorCusto !== null && Number.isNaN(valorCusto))
                    return toast.error("Valor de custo inválido");

                  receberEstoque.mutate({
                    quantidade,
                    valor_custo: valorCusto,
                    atualizar_custo: atualizarCusto,
                  });
                }}
                className="space-y-3"
              >
                <p className="text-sm text-muted-foreground">
                  Produto: <span className="font-medium text-foreground">{p.nome}</span> · estoque
                  atual: {p.quantidade}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Quantidade recebida</Label>
                    <Input name="quantidade" type="number" min={1} defaultValue={1} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Novo custo unitário (R$)</Label>
                    <Input
                      name="valor_custo"
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input name="atualizar_custo" type="checkbox" className="h-4 w-4" />
                  Atualizar o valor de custo do produto
                </label>
                <DialogFooter>
                  <Button type="submit" disabled={receberEstoque.isPending}>
                    Receber
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Mini
          label="Estoque atual"
          value={String(p.quantidade)}
          tone={baixo ? "warning" : undefined}
        />
        <Mini label="Estoque mínimo" value={String(p.estoque_minimo)} />
        <Mini label="Valor de custo" value={formatBRL(p.valor_custo)} />
        <Mini label="Valor de venda" value={formatBRL(p.valor_venda)} />
        <Mini label="Lucro unitário" value={formatBRL(lucroUnit)} />
        <Mini label="Quantidade vendida" value={String(qtdVendida)} />
        <Mini label="Saída média/venda" value={saidaMedia.toFixed(1)} />
        <Mini
          label="Sugestão reposição"
          value={p.sugestao_novo_pedido ? formatDate(p.sugestao_novo_pedido) : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de saídas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.itens.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Ainda sem saídas.</p>
          ) : (
            <ul className="divide-y">
              {data.itens.map((i) => (
                <li key={i.id} className="flex items-center justify-between p-3">
                  <div>
                    <Link
                      to="/vendas/$id"
                      params={{ id: i.venda_id }}
                      className="text-sm hover:underline"
                    >
                      {i.vendas ? formatDateTime(i.vendas.criado_em) : "-"}
                    </Link>
                    {i.vendas?.status === "cancelada" && (
                      <Badge variant="destructive" className="ml-2">
                        cancelada
                      </Badge>
                    )}
                  </div>
                  <div className="text-right text-sm">
                    <div>{i.quantidade} un</div>
                    <div className="text-muted-foreground">{formatBRL(i.subtotal)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Última compra: {p.ultima_compra ? formatDate(p.ultima_compra) : "—"}
      </p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
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
