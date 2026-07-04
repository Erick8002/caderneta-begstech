import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estoque/$id")({
  component: ProdutoDetalhes,
});

function ProdutoDetalhes() {
  const { id } = Route.useParams();

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

  if (!data?.produto) return <div>Carregando…</div>;
  const p = data.produto;
  const validas = data.itens.filter((i) => i.vendas?.status !== "cancelada");
  const qtdVendida = validas.reduce((s, i) => s + i.quantidade, 0);
  const saidaMedia = validas.length ? qtdVendida / validas.length : 0;
  const lucroUnit = Number(p.valor_venda) - Number(p.valor_custo);
  const baixo = p.quantidade <= p.estoque_minimo;

  return (
    <div className="space-y-4">
      <Link to="/estoque" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Estoque
      </Link>
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
          <Link to="/fornecedores/$id" params={{ id: p.fornecedores.id }} className="underline">
            {p.fornecedores.nome}
          </Link>
        ) : (
          "—"
        )}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Mini label="Estoque atual" value={String(p.quantidade)} tone={baixo ? "warning" : undefined} />
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
                    <Link to="/vendas/$id" params={{ id: i.venda_id }} className="text-sm hover:underline">
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

      <p className="text-xs text-muted-foreground">Última compra: {p.ultima_compra ? formatDate(p.ultima_compra) : "—"}</p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-1 ${tone === "warning" ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
