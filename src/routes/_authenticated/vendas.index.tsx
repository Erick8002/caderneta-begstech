import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendas/")({
  component: VendasPage,
});

function VendasPage() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("todos");
  const [forma, setForma] = useState<string>("todos");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  const { data: vendas = [] } = useQuery({
    queryKey: ["vendas-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(
          "id, criado_em, valor_total, forma_pagamento, status, vendedor_id, cliente_id, clientes(nome), profiles!vendas_vendedor_id_fkey(nome)",
        )
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error) {
        // fallback sem embed de profiles se relacionamento não estiver visível
        const r2 = await supabase
          .from("vendas")
          .select("id, criado_em, valor_total, forma_pagamento, status, vendedor_id, cliente_id, clientes(nome)")
          .order("criado_em", { ascending: false })
          .limit(200);
        if (r2.error) throw r2.error;
        return r2.data.map((v) => ({ ...v, profiles: null }));
      }
      return data;
    },
  });

  const { data: perfis = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      return data;
    },
  });
  const perfilMap = useMemo(() => Object.fromEntries(perfis.map((p) => [p.id, p.nome])), [perfis]);

  const filtradas = vendas.filter((v) => {
    if (status !== "todos" && v.status !== status) return false;
    if (forma !== "todos" && v.forma_pagamento !== forma) return false;
    if (dataDe && new Date(v.criado_em) < new Date(dataDe)) return false;
    if (dataAte) {
      const ate = new Date(dataAte);
      ate.setHours(23, 59, 59);
      if (new Date(v.criado_em) > ate) return false;
    }
    if (busca) {
      const b = busca.toLowerCase();
      const cli = v.clientes?.nome?.toLowerCase() ?? "";
      const vend = perfilMap[v.vendedor_id]?.toLowerCase() ?? "";
      if (!cli.includes(b) && !vend.includes(b)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-sm text-muted-foreground">{filtradas.length} de {vendas.length}</p>
        </div>
        <Link to="/vendas/nova">
          <Button size="lg">
            <Plus className="h-4 w-4 mr-2" /> Nova venda
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <div className="relative md:col-span-2">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Cliente ou vendedor…" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="paga">Pagas</SelectItem>
                <SelectItem value="fiada">Fiadas</SelectItem>
                <SelectItem value="cancelada">Canceladas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as formas</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="fiado">Fiado</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2 md:col-span-1">
              <Input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
              <Input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <Link to="/vendas/$id" params={{ id: v.id }} className="hover:underline">
                      {formatDateTime(v.criado_em)}
                    </Link>
                  </TableCell>
                  <TableCell>{v.clientes?.nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{perfilMap[v.vendedor_id] ?? "—"}</TableCell>
                  <TableCell className="uppercase text-xs">{v.forma_pagamento}</TableCell>
                  <TableCell className="font-medium">{formatBRL(v.valor_total)}</TableCell>
                  <TableCell>
                    {v.status === "paga" && <Badge className="bg-success text-success-foreground">Paga</Badge>}
                    {v.status === "fiada" && <Badge className="bg-warning text-warning-foreground">Fiada</Badge>}
                    {v.status === "cancelada" && <Badge variant="destructive">Cancelada</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {filtradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma venda encontrada.
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
