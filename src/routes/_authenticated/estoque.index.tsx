import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/estoque/")({
  component: EstoquePage,
});

function EstoquePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [openReceber, setOpenReceber] = useState(false);
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [produtoReceberId, setProdutoReceberId] = useState<string>("");

  const { data: produtos = [] } = useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("*, fornecedores(nome)")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("produtos").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto cadastrado");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      setOpen(false);
      setFornecedorId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const receberEstoque = useMutation({
    mutationFn: async (payload: {
      produto_id: string;
      quantidade: number;
      valor_custo: number | null;
      atualizar_custo: boolean;
    }) => {
      const { error } = await supabase.rpc("receber_estoque_produto", {
        p_produto_id: payload.produto_id,
        p_quantidade: payload.quantidade,
        p_valor_custo: payload.valor_custo,
        p_atualizar_custo: payload.atualizar_custo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estoque recebido");
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpenReceber(false);
      setProdutoReceberId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      qc.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function abrirRecebimento(produtoId?: string) {
    setProdutoReceberId(produtoId ?? "");
    setOpenReceber(true);
  }

  const hoje = new Date();
  const filtrados = produtos.filter((p) =>
    (p.nome + " " + (p.sku ?? "") + " " + (p.categoria ?? ""))
      .toLowerCase()
      .includes(busca.toLowerCase()),
  );
  const produtoReceber = produtos.find((p) => p.id === produtoReceberId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque</h1>
          <p className="text-sm text-muted-foreground">{produtos.length} produto(s)</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={() => abrirRecebimento()}>
              <PackagePlus className="h-4 w-4 mr-2" /> Receber estoque
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="h-4 w-4 mr-2" /> Novo produto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Cadastrar produto</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    criar.mutate({
                      nome: String(f.get("nome")),
                      sku: String(f.get("sku") ?? "") || null,
                      categoria: String(f.get("categoria") ?? "") || null,
                      quantidade: Number(f.get("quantidade") ?? 0),
                      estoque_minimo: Number(f.get("estoque_minimo") ?? 0),
                      valor_custo: Number(f.get("valor_custo") ?? 0),
                      valor_venda: Number(f.get("valor_venda") ?? 0),
                      fornecedor_id: fornecedorId || null,
                    });
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input name="nome" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input name="sku" />
                    </div>
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Input name="categoria" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Quantidade</Label>
                      <Input name="quantidade" type="number" defaultValue={0} min={0} />
                    </div>
                    <div className="space-y-2">
                      <Label>Estoque mínimo</Label>
                      <Input name="estoque_minimo" type="number" defaultValue={0} min={0} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Valor de custo (R$)</Label>
                      <Input
                        name="valor_custo"
                        type="number"
                        step="0.01"
                        defaultValue={0}
                        min={0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor de venda (R$)</Label>
                      <Input
                        name="valor_venda"
                        type="number"
                        step="0.01"
                        defaultValue={0}
                        min={0}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Fornecedor</Label>
                    <Select value={fornecedorId} onValueChange={setFornecedorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar fornecedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {fornecedores.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={criar.isPending}>
                      Cadastrar
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Dialog open={openReceber} onOpenChange={setOpenReceber}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receber estoque de produto existente</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const quantidade = Number(f.get("quantidade"));
              const custoRaw = String(f.get("valor_custo") ?? "").trim();
              const valorCusto = custoRaw === "" ? null : Number(custoRaw);
              const atualizarCusto = f.get("atualizar_custo") === "on";

              if (!produtoReceberId) return toast.error("Selecione um produto");
              if (Number.isNaN(quantidade) || quantidade <= 0)
                return toast.error("Quantidade inválida");
              if (valorCusto !== null && Number.isNaN(valorCusto))
                return toast.error("Valor de custo inválido");

              receberEstoque.mutate({
                produto_id: produtoReceberId,
                quantidade,
                valor_custo: valorCusto,
                atualizar_custo: atualizarCusto,
              });
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label>Produto</Label>
              <Select value={produtoReceberId} onValueChange={setProdutoReceberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar produto" />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} — estoque atual: {p.quantidade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {produtoReceber && (
                <p className="text-xs text-muted-foreground">
                  Custo atual: {formatBRL(produtoReceber.valor_custo)} · Venda:{" "}
                  {formatBRL(produtoReceber.valor_venda)}
                </p>
              )}
            </div>
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
                Receber estoque
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto…"
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Reposição</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => {
                const baixo = p.quantidade <= p.estoque_minimo;
                const reporHoje =
                  p.sugestao_novo_pedido && new Date(p.sugestao_novo_pedido) <= hoje;
                return (
                  <TableRow key={p.id} className={baixo ? "bg-destructive/5" : ""}>
                    <TableCell>
                      <Link
                        to="/estoque/$id"
                        params={{ id: p.id }}
                        className="font-medium hover:underline"
                      >
                        {p.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">SKU {p.sku ?? "-"}</div>
                    </TableCell>
                    <TableCell>{p.categoria ?? "-"}</TableCell>
                    <TableCell>{p.fornecedores?.nome ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={baixo ? "text-destructive font-semibold" : ""}>
                          {p.quantidade}
                        </span>
                        {baixo && <AlertTriangle className="h-4 w-4 text-destructive" />}
                      </div>
                      <div className="text-xs text-muted-foreground">mín. {p.estoque_minimo}</div>
                    </TableCell>
                    <TableCell>{formatBRL(p.valor_venda)}</TableCell>
                    <TableCell>
                      {p.sugestao_novo_pedido ? (
                        reporHoje ? (
                          <Badge variant="destructive">{formatDate(p.sugestao_novo_pedido)}</Badge>
                        ) : (
                          <span className="text-sm">{formatDate(p.sugestao_novo_pedido)}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirRecebimento(p.id)}
                            title="Receber estoque"
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirm(`Remover ${p.nome}?`) && remover.mutate(p.id)}
                            title="Remover produto"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum produto.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
