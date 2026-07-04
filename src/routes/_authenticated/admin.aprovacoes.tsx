import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
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
import { CheckCircle2, XCircle, UserCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/aprovacoes")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AprovacoesPage,
});

function AprovacoesPage() {
  const qc = useQueryClient();

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["solicitacoes-vendedor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_vendedor")
        .select("id, user_id, nome, email, status, criado_em, analisado_em, observacao")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const aprovar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("aprovar_vendedor", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vendedor aprovado");
      qc.invalidateQueries({ queryKey: ["solicitacoes-vendedor"] });
      qc.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejeitar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("rejeitar_vendedor", {
        p_user_id: userId,
        p_observacao: "Rejeitado pelo administrador",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação rejeitada");
      qc.invalidateQueries({ queryKey: ["solicitacoes-vendedor"] });
      qc.invalidateQueries({ queryKey: ["aprovacoes-pendentes-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendentes = solicitacoes.filter((s) => s.status === "pendente").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCheck className="h-6 w-6" /> Aprovação de vendedores
        </h1>
        <p className="text-sm text-muted-foreground">
          Novas contas de vendedores aparecem aqui para aprovação do administrador.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold mt-1">{pendentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Total de solicitações</p>
            <p className="text-2xl font-bold mt-1">{solicitacoes.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitações</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Solicitado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && solicitacoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhuma solicitação de vendedor.
                  </TableCell>
                </TableRow>
              )}
              {solicitacoes.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nome}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{formatDateTime(s.criado_em)}</TableCell>
                  <TableCell>
                    {s.status === "pendente" && <Badge variant="secondary">Pendente</Badge>}
                    {s.status === "aprovado" && (
                      <Badge className="bg-success text-success-foreground">Aprovado</Badge>
                    )}
                    {s.status === "rejeitado" && <Badge variant="destructive">Rejeitado</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.status === "pendente" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => aprovar.mutate(s.user_id)}
                          disabled={aprovar.isPending || rejeitar.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            confirm(`Rejeitar ${s.nome}?`) && rejeitar.mutate(s.user_id)
                          }
                          disabled={aprovar.isPending || rejeitar.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {s.analisado_em ? formatDateTime(s.analisado_em) : (s.observacao ?? "—")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default AprovacoesPage;
