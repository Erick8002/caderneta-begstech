import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/clientes/")({
  component: ClientesPage,
});

function ClientesPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async (payload: { nome: string; telefone: string; cpf: string }) => {
      const { error } = await supabase.from("clientes").insert({
        nome: payload.nome,
        telefone: payload.telefone || null,
        cpf: payload.cpf || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = clientes.filter((c) =>
    (c.nome + " " + (c.telefone ?? "") + " " + (c.cpf ?? "")).toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} cadastrado(s)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <UserPlus className="h-4 w-4 mr-2" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar cliente</DialogTitle>
              <DialogDescription>Informe os dados básicos.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                criar.mutate({
                  nome: String(f.get("nome")),
                  telefone: String(f.get("telefone") ?? ""),
                  cpf: String(f.get("cpf") ?? ""),
                });
              }}
              className="space-y-3"
            >
              <div className="space-y-2">
                <Label htmlFor="c-nome">Nome *</Label>
                <Input id="c-nome" name="nome" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-tel">Telefone</Label>
                <Input id="c-tel" name="telefone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-cpf">CPF (opcional)</Label>
                <Input id="c-cpf" name="cpf" />
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

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente…"
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
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Compras</TableHead>
                <TableHead>Limite fiado</TableHead>
                <TableHead>Saldo devedor</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to="/clientes/$id" params={{ id: c.id }} className="hover:underline font-medium">
                      {c.nome}
                    </Link>
                    <div className="text-xs text-muted-foreground">Desde {formatDate(c.criado_em)}</div>
                  </TableCell>
                  <TableCell>{c.telefone ?? "-"}</TableCell>
                  <TableCell>{c.qtd_compras}</TableCell>
                  <TableCell>{formatBRL(c.limite_fiado)}</TableCell>
                  <TableCell>
                    {Number(c.saldo_devedor) > 0 ? (
                      <Badge variant="destructive">{formatBRL(c.saldo_devedor)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">R$ 0,00</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remover ${c.nome}?`)) remover.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum cliente encontrado.
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
