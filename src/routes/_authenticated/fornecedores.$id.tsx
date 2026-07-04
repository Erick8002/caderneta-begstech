import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fornecedores/$id")({
  component: FornecedorDetalhes,
});

function FornecedorDetalhes() {
  const { id } = Route.useParams();

  const { data } = useQuery({
    queryKey: ["fornecedor", id],
    queryFn: async () => {
      const [forn, prods] = await Promise.all([
        supabase.from("fornecedores").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("produtos")
          .select("id, nome, sku, quantidade, valor_venda, ultima_compra")
          .eq("fornecedor_id", id)
          .order("nome"),
      ]);
      if (forn.error) throw forn.error;
      return { fornecedor: forn.data, produtos: prods.data ?? [] };
    },
  });

  if (!data?.fornecedor) return <div>Carregando…</div>;
  const f = data.fornecedor;
  const ultimaCompra = data.produtos
    .map((p) => (p.ultima_compra ? new Date(p.ultima_compra).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <div className="space-y-4">
      <Link
        to="/fornecedores"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Fornecedores
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{f.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {f.telefone ?? "—"} · {f.email ?? "sem e-mail"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Info label="CNPJ" value={f.cnpj ?? "—"} />
        <Info label="Endereço" value={f.endereco ?? "—"} />
        <Info label="Produtos" value={String(data.produtos.length)} />
        <Info
          label="Última compra"
          value={ultimaCompra ? formatDate(new Date(ultimaCompra)) : "—"}
        />
      </div>

      {f.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{f.observacoes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos fornecidos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.produtos.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum produto vinculado.</p>
          ) : (
            <ul className="divide-y">
              {data.produtos.map((p) => (
                <li key={p.id} className="flex items-center justify-between p-3">
                  <div>
                    <Link
                      to="/estoque/$id"
                      params={{ id: p.id }}
                      className="font-medium hover:underline"
                    >
                      {p.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">SKU {p.sku ?? "-"}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{p.quantidade} un</div>
                    <div className="text-muted-foreground">{formatBRL(p.valor_venda)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="text-sm font-medium mt-1 break-words">{value}</p>
      </CardContent>
    </Card>
  );
}
