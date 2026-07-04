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
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type FormaPagamento = "dinheiro" | "pix" | "cartao" | "fiado";

interface Item {
  produto_id: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  estoque: number;
}

export const Route = createFileRoute("/_authenticated/vendas/nova")({
  component: NovaVenda,
});

function NovaVenda() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState<string>("");
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [produtoSel, setProdutoSel] = useState<string>("");
  const [itens, setItens] = useState<Item[]>([]);

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, quantidade, valor_venda")
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

  function addProduto() {
    if (!produtoSel) return;
    if (itens.find((i) => i.produto_id === produtoSel)) {
      toast.info("Produto já na lista, ajuste a quantidade.");
      return;
    }
    const p = produtos.find((p) => p.id === produtoSel);
    if (!p) return;
    setItens((prev) => [
      ...prev,
      {
        produto_id: p.id,
        nome: p.nome,
        quantidade: 1,
        valor_unitario: Number(p.valor_venda),
        estoque: p.quantidade,
      },
    ]);
    setProdutoSel("");
  }

  function atualizarQtd(id: string, qtd: number) {
    setItens((prev) =>
      prev.map((i) =>
        i.produto_id === id ? { ...i, quantidade: Math.max(1, Math.min(qtd, i.estoque)) } : i,
      ),
    );
  }
  function remover(id: string) {
    setItens((prev) => prev.filter((i) => i.produto_id !== id));
  }

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

  function finalizar() {
    if (itens.length === 0) return toast.error("Adicione ao menos um produto");
    if (forma === "fiado" && !podeFiado.ok) return toast.error(podeFiado.msg);
    if (forma !== "fiado" && !clienteId) {
      // ok, venda paga sem cliente
    }
    criar.mutate();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-2xl font-bold">Nova venda</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Select value={produtoSel} onValueChange={setProdutoSel}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher produto" />
                </SelectTrigger>
                <SelectContent>
                  {produtos
                    .filter((p) => !itens.find((i) => i.produto_id === p.id))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome} — {formatBRL(p.valor_venda)} ({p.quantidade} em estoque)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={addProduto} disabled={!produtoSel}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum produto adicionado.
              </p>
            ) : (
              <ul className="divide-y">
                {itens.map((i) => (
                  <li key={i.produto_id} className="py-3 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <div className="font-medium">{i.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBRL(i.valor_unitario)} × un
                      </div>
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={1}
                        max={i.estoque}
                        value={i.quantidade}
                        onChange={(e) => atualizarQtd(i.produto_id, Number(e.target.value))}
                      />
                    </div>
                    <div className="col-span-3 text-right font-medium">
                      {formatBRL(i.quantidade * i.valor_unitario)}
                    </div>
                    <div className="col-span-1 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remover(i.produto_id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>
                Cliente {forma === "fiado" && <span className="text-destructive">*</span>}
              </Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as FormaPagamento)}>
                <SelectTrigger>
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

            <div className="border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-2xl font-bold">{formatBRL(total)}</span>
              </div>
            </div>

            <Button size="lg" className="w-full" onClick={finalizar} disabled={criar.isPending}>
              Finalizar venda
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
