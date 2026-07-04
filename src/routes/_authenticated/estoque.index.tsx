import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, ReactNode, useMemo, useState } from "react";
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
  AlertTriangle,
  Camera,
  ChevronRight,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ProductImage } from "@/components/product-image";
import { fileToDataUrl } from "@/lib/product-images";

export const Route = createFileRoute("/_authenticated/estoque/")({
  component: EstoquePage,
});

type FilterKey = "todos" | "baixo" | "reposicao" | "sem";

function EstoquePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FilterKey>("todos");
  const [open, setOpen] = useState(false);
  const [openReceber, setOpenReceber] = useState(false);
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [produtoReceberId, setProdutoReceberId] = useState<string>("");
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

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
      setFotoPreview(null);
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

  async function handleFotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFotoPreview(await fileToDataUrl(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar a foto");
    }
  }

  function abrirRecebimento(produtoId?: string) {
    setProdutoReceberId(produtoId ?? "");
    setOpenReceber(true);
  }

  const filtrados = useMemo(() => {
    const hoje = new Date();
    return produtos.filter((p) => {
      const termoOk = (p.nome + " " + (p.sku ?? "") + " " + (p.categoria ?? ""))
        .toLowerCase()
        .includes(busca.toLowerCase());
      if (!termoOk) return false;

      const baixo = p.quantidade <= p.estoque_minimo;
      const reporHoje = !!p.sugestao_novo_pedido && new Date(p.sugestao_novo_pedido) <= hoje;
      const semEstoque = p.quantidade <= 0;

      if (filtro === "baixo") return baixo && !semEstoque;
      if (filtro === "reposicao") return reporHoje;
      if (filtro === "sem") return semEstoque;
      return true;
    });
  }, [busca, filtro, produtos]);
  const produtoReceber = produtos.find((p) => p.id === produtoReceberId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque</h1>
          <p className="text-sm text-muted-foreground">Catálogo visual de produtos</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={() => abrirRecebimento()}>
              <PackagePlus className="h-4 w-4 mr-2" /> Receber estoque
            </Button>
            <Dialog
              open={open}
              onOpenChange={(value) => {
                setOpen(value);
                if (!value) setFotoPreview(null);
              }}
            >
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
                      foto_url: fotoPreview,
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <div className="flex items-start gap-4">
                      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border bg-background">
                        <ProductImage src={fotoPreview} alt="Prévia do produto" />
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="font-medium">Foto do produto</p>
                          <p className="text-sm text-muted-foreground">
                            Tire uma foto ou faça upload para transformar o estoque em vitrine.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
                            <Camera className="h-4 w-4" />
                            Tirar foto
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={handleFotoChange}
                            />
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
                            <Upload className="h-4 w-4" />
                            Fazer upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleFotoChange}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

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

      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader className="px-0 pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative md:max-w-md md:flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
                className="pl-9 rounded-2xl"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterButton active={filtro === "todos"} onClick={() => setFiltro("todos")}>
                Todos
              </FilterButton>
              <FilterButton active={filtro === "baixo"} onClick={() => setFiltro("baixo")}>
                Baixo estoque
              </FilterButton>
              <FilterButton active={filtro === "reposicao"} onClick={() => setFiltro("reposicao")}>
                Reposição
              </FilterButton>
              <FilterButton active={filtro === "sem"} onClick={() => setFiltro("sem")}>
                Sem estoque
              </FilterButton>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {filtrados.length === 0 ? (
            <div className="rounded-3xl border bg-card p-8 text-center text-muted-foreground">
              Nenhum produto encontrado.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtrados.map((p) => {
                const baixo = p.quantidade <= p.estoque_minimo;
                const semEstoque = p.quantidade <= 0;
                const reporHoje =
                  !!p.sugestao_novo_pedido && new Date(p.sugestao_novo_pedido) <= new Date();

                return (
                  <Card key={p.id} className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border bg-muted/40">
                          <ProductImage src={p.foto_url} alt={p.nome} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Link
                                to="/estoque/$id"
                                params={{ id: p.id }}
                                className="line-clamp-2 text-base font-semibold hover:underline"
                              >
                                {p.nome}
                              </Link>
                              <p className="mt-1 text-sm font-medium text-primary">
                                {formatBRL(p.valor_venda)}
                              </p>
                              <div className="mt-1 space-y-0.5">
                                <p className="text-sm font-medium text-primary">
                                  Venda: {formatBRL(p.valor_venda)}
                                </p>

                                {isAdmin && (
                                  <p className="text-xs text-muted-foreground">
                                    Custo: {formatBRL(p.valor_custo)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Estoque:{" "}
                            <span className="font-medium text-foreground">{p.quantidade} un</span>
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {semEstoque ? (
                              <Badge variant="destructive">Sem estoque</Badge>
                            ) : baixo ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> Baixo
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                Ok
                              </Badge>
                            )}
                            {reporHoje && (
                              <Badge
                                variant="outline"
                                className="border-orange-300 text-orange-600"
                              >
                                Repor
                              </Badge>
                            )}
                            {p.categoria && <Badge variant="secondary">{p.categoria}</Badge>}
                          </div>
                          {p.sugestao_novo_pedido && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Próximo pedido: {formatDate(p.sugestao_novo_pedido)}
                            </p>
                          )}
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => abrirRecebimento(p.id)}
                          >
                            <PackagePlus className="mr-2 h-4 w-4" /> Receber
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => confirm(`Remover ${p.nome}?`) && remover.mutate(p.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                            Remover
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      className="rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
