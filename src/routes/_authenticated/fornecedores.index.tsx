import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fornecedores/")({
  component: FornecedoresPage,
});

function FornecedoresPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);

  const { data: lista = [] } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async (p: {
      nome: string;
      telefone: string;
      email: string;
      cnpj: string;
      endereco: string;
      observacoes: string;
    }) => {
      const { error } = await supabase.from("fornecedores").insert({
        nome: p.nome,
        telefone: p.telefone || null,
        email: p.email || null,
        cnpj: p.cnpj || null,
        endereco: p.endereco || null,
        observacoes: p.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fornecedor cadastrado");
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fornecedores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fornecedor removido");
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = lista.filter((f) =>
    (f.nome + " " + (f.cnpj ?? "") + " " + (f.telefone ?? ""))
      .toLowerCase()
      .includes(busca.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">{lista.length} cadastrado(s)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus className="h-4 w-4 mr-2" /> Novo fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar fornecedor</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                criar.mutate({
                  nome: String(f.get("nome")),
                  telefone: String(f.get("telefone") ?? ""),
                  email: String(f.get("email") ?? ""),
                  cnpj: String(f.get("cnpj") ?? ""),
                  endereco: String(f.get("endereco") ?? ""),
                  observacoes: String(f.get("observacoes") ?? ""),
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
                  <Label>Telefone</Label>
                  <Input name="telefone" />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input name="cnpj" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input name="email" type="email" />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input name="endereco" />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea name="observacoes" rows={2} />
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
              placeholder="Buscar fornecedor…"
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
                <TableHead>E-mail</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link
                      to="/fornecedores/$id"
                      params={{ id: f.id }}
                      className="hover:underline font-medium"
                    >
                      {f.nome}
                    </Link>
                  </TableCell>
                  <TableCell>{f.telefone ?? "-"}</TableCell>
                  <TableCell>{f.email ?? "-"}</TableCell>
                  <TableCell>{f.cnpj ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirm(`Remover ${f.nome}?`) && remover.mutate(f.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum fornecedor.
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
