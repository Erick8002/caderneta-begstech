import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, Minus, Plus, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { ProductImage } from "@/components/product-image";

type FormaPagamento = "dinheiro" | "pix" | "cartao" | "fiado";

interface Item {
  produto_id: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  estoque: number;
  foto_url?: string | null;
}

export const Route = createFileRoute("/_authenticated/vendas/nova")({
  component: NovaVenda,
});

function NovaVenda() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState<string>("");
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<Item[]>([]);

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, quantidade, valor_venda, estoque_minimo, foto_url")
        .gt("quantidade", 0)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, qtd_compras, limite_fiado, saldo_devedor")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const clienteSel = clientes.find((c) => c.id === clienteId);
  const totalItens = itens.reduce((sum, item) => sum + item.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const disponivel = clienteSel
    ? Number(clienteSel.limite_fiado) - Number(clienteSel.saldo_devedor)
    : 0;

  const podeFiado = useMemo(() => {
    if (!clienteSel) return { ok: false, msg: "Selecione um cliente cadastrado." };
    if (clienteSel.qtd_compras < 3)
      return {
        ok: false,
        msg: `Cliente só pode comprar fiado a partir da 3ª compra (atual: ${clienteSel.qtd_compras}).`,
      };
    if (total > disponivel)
      return { ok: false, msg: `Limite insuficiente. Disponível: ${formatBRL(disponivel)}` };
    return { ok: true, msg: "" };
  }, [clienteSel, total, disponivel]);

  const produtosFiltrados = useMemo(
    () => produtos.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase().trim())),
    [busca, produtos],
  );

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("criar_venda", {
        p_cliente_id: clienteId || null,
        p_forma_pagamento: forma,
        p_itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      toast.success("Venda registrada!");
      qc.invalidateQueries();
      navigate({ to: "/vendas/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function alterarQuantidade(produto: (typeof produtos)[number], delta: number) {
    setItens((prev) => {
      const atual = prev.find((item) => item.produto_id === produto.id);
      const qtdAtual = atual?.quantidade ?? 0;
      const novaQtd = Math.max(0, Math.min(qtdAtual + delta, produto.quantidade));

      if (novaQtd === 0) {
        return prev.filter((item) => item.produto_id !== produto.id);
      }

      if (atual) {
        return prev.map((item) =>
          item.produto_id === produto.id ? { ...item, quantidade: novaQtd } : item,
        );
      }

      return [
        ...prev,
        {
          produto_id: produto.id,
          nome: produto.nome,
          quantidade: 1,
          valor_unitario: Number(produto.valor_venda),
          estoque: produto.quantidade,
          foto_url: produto.foto_url,
        },
      ];
    });
  }

  function qtdDoProduto(produtoId: string) {
    return itens.find((item) => item.produto_id === produtoId)?.quantidade ?? 0;
  }

  function finalizar() {
    if (itens.length === 0) return toast.error("Adicione ao menos um produto");
    if (forma === "fiado" && !podeFiado.ok) return toast.error(podeFiado.msg);
    criar.mutate();
  }

  return (
    <div className="space-y-4 pb-28 lg:pb-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Venda
        </p>
        <h1 className="text-2xl font-bold">Nova venda</h1>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          <Card className="rounded-3xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              <Label>
                Selecionar cliente{" "}
                {forma === "fiado" && <span className="text-destructive">*</span>}
              </Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Sem cadastro" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clienteSel && (
                <p className="text-xs text-muted-foreground">
                  {clienteSel.qtd_compras} compras · Fiado disponível: {formatBRL(disponivel)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Produtos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar produto..."
                    className="rounded-2xl pl-9"
                  />
                </div>
              </div>

              <div className="h-[285px] overflow-y-auto pr-2 overscroll-contain rounded-2xl sm:h-[310px]">
                <div className="grid gap-3">
                  {produtosFiltrados.map((produto) => {
                    const quantidadeSelecionada = qtdDoProduto(produto.id);
                    const baixo = produto.quantidade <= produto.estoque_minimo;
                    return (
                      <Card
                        key={produto.id}
                        className="overflow-hidden rounded-3xl border shadow-sm"
                      >
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border bg-muted/40">
                              <ProductImage src={produto.foto_url} alt={produto.nome} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="line-clamp-2 text-base font-semibold">
                                    {produto.nome}
                                  </h3>
                                  <p className="mt-1 text-lg font-bold text-green-600">
                                    {formatBRL(produto.valor_venda)}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <Button
                                    type="button"
                                    size="icon"
                                    className="h-10 w-10 rounded-full"
                                    onClick={() => alterarQuantidade(produto, 1)}
                                    disabled={quantidadeSelecionada >= produto.quantidade}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                  <span className="text-base font-semibold">
                                    {quantidadeSelecionada}
                                  </span>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-9 w-9 rounded-full"
                                    onClick={() => alterarQuantidade(produto, -1)}
                                    disabled={quantidadeSelecionada === 0}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {produto.quantidade <= 0 ? (
                                  <Badge variant="destructive">Sem estoque</Badge>
                                ) : baixo ? (
                                  <Badge variant="destructive">Baixo estoque</Badge>
                                ) : (
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                    Em estoque
                                  </Badge>
                                )}
                                <Badge variant="secondary">{produto.quantidade} un</Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {produtosFiltrados.length === 0 && (
                    <Card className="rounded-3xl">
                      <CardContent className="p-10 text-center text-sm text-muted-foreground">
                        Nenhum produto encontrado.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit rounded-3xl lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">Resumo da venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as FormaPagamento)}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="fiado">Fiado</SelectItem>
                </SelectContent>
              </Select>
              {forma === "fiado" && clienteSel && !podeFiado.ok && (
                <p className="text-xs text-destructive">{podeFiado.msg}</p>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Itens</span>
                <span className="font-semibold">{totalItens}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Produtos diferentes</span>
                <span className="font-semibold">{itens.length}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-green-600">{formatBRL(total)}</span>
              </div>
            </div>

            {itens.length > 0 && (
              <div className="space-y-2 rounded-2xl border p-3">
                <p className="text-sm font-medium">Itens selecionados</p>
                <ul className="space-y-2">
                  {itens.map((item) => (
                    <li
                      key={item.produto_id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantidade} × {formatBRL(item.valor_unitario)}
                        </p>
                      </div>
                      <span className="font-semibold">
                        {formatBRL(item.quantidade * item.valor_unitario)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              size="lg"
              className="hidden w-full lg:flex"
              onClick={finalizar}
              disabled={criar.isPending}
            >
              Finalizar venda
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-3 rounded-2xl border px-3 py-2">
            <ShoppingCart className="h-5 w-5" />
            <div className="text-sm">
              <div>
                Itens <span className="font-semibold">{totalItens}</span>
              </div>
              <div className="font-semibold text-green-600">{formatBRL(total)}</div>
            </div>
          </div>
          <Button
            size="lg"
            className="flex-1 rounded-2xl"
            onClick={finalizar}
            disabled={criar.isPending}
          >
            Finalizar venda
          </Button>
        </div>
      </div>
    </div>
  );
}
