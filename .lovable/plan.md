# Caderneta Digital BEGSTech — MVP

Vou entregar o MVP funcional completo em uma única sequência de implementação. Escopo grande, então dividido em fases dentro do mesmo build.

## 1. Backend (Lovable Cloud)

Ativar Cloud e criar schema:

- `profiles` (id, nome, email, criado_em) — vinculada a `auth.users`
- `user_roles` (id, user_id, role: `admin`|`vendedor`) — tabela separada + função `has_role()` (evita recursão RLS)
- `fornecedores` (id, nome, telefone, email, cnpj, endereco, observacoes)
- `clientes` (id, nome, telefone, cpf, criado_em, qtd_compras, limite_fiado default 100, saldo_devedor default 0)
- `produtos` (id, nome, sku, categoria, quantidade, estoque_minimo, valor_custo, valor_venda, fornecedor_id, ultima_compra, sugestao_novo_pedido, status)
- `vendas` (id, cliente_id, vendedor_id, criado_em, valor_total, custo_total, lucro_total, forma_pagamento: `dinheiro`|`pix`|`cartao`|`fiado`, status: `paga`|`fiada`|`cancelada`)
- `itens_venda` (id, venda_id, produto_id, quantidade, valor_unitario, valor_custo, subtotal, lucro)
- `pagamentos_fiado` (id, cliente_id, venda_id, valor_pago, data_pagamento, observacao)

RLS: leitura para authenticated, mutações sensíveis (delete, alterar limite, cancelar venda) só para admin via `has_role()`.

Regras de negócio implementadas em **server functions** (`createServerFn`) com `requireSupabaseAuth`:

- `criarVenda` — valida estoque, valida fiado (cliente cadastrado, ≥3 compras, dentro do limite), cria venda + itens, dá baixa no estoque, atualiza saldo devedor
- `cancelarVenda` (admin) — devolve estoque, zera lucros, devolve saldo devedor
- `registrarPagamentoFiado` (admin) — parcial ou total
- `alterarLimiteFiado` (admin)

Trigger que cria `profile` + role `vendedor` no signup (primeiro usuário vira `admin`).

## 2. Autenticação

- Rota pública `/auth` (login + cadastro, email/senha)
- Layout `_authenticated/route.tsx` (integração gerida) protege todo o app
- Hook `useRole()` para gating de UI (esconder cards/botões admin-only)
- Header com nome do usuário, badge do papel, e sair

## 3. Rotas (todas sob `_authenticated`)

- `/` — Dashboard: cards de resumo (vendas dia, total dia, estoque baixo, clientes devendo) + botões grandes de navegação. Vendedor vê apenas suas vendas.
- `/vendas` — lista com filtros (cliente, data, vendedor, status, forma pgto) + botão nova venda
- `/vendas/nova` — seleciona cliente (opcional se pago), adiciona produtos, define pagamento, finaliza
- `/vendas/$id` — detalhes + cancelar (admin)
- `/estoque` — lista de produtos com destaque vermelho para estoque baixo / reposição
- `/estoque/novo`, `/estoque/$id` (detalhes com histórico, lucro unitário, saída média, sugestão)
- `/clientes` — lista + cadastro rápido
- `/clientes/$id` — histórico compras + fiado + alterar limite (admin)
- `/fornecedores` — lista + cadastro
- `/fornecedores/$id` — dados + produtos vinculados + última compra
- `/fiado` — clientes com saldo devedor, histórico pagamentos, registrar pagamento (admin)
- `/financeiro` (admin only) — cards, filtros por período/vendedor/pagamento, gráficos (recharts): vendas por dia, lucro por mês, ranking vendedores

## 4. Design System

- Azul escuro `oklch(~0.30 0.10 250)` como primary
- Fundo cinza claro / branco
- Tokens semânticos: `--success` (verde), `--warning` (amarelo), `--destructive` (vermelho)
- Cards grandes com ícones (lucide), tipografia Inter, botões grandes e legíveis
- Responsivo mobile-first (sidebar vira drawer no mobile)
- Formatação `R$` via helper `formatBRL`

## 5. Dados de exemplo

Migration com seed: 3 fornecedores, ~10 produtos, ~5 clientes (alguns com histórico), ~8 vendas (algumas fiadas, uma cancelada), 2 pagamentos de fiado. Usuários admin/vendedor precisam ser criados via signup (primeiro = admin).

## Detalhes técnicos

- Server fns em `src/lib/*.functions.ts`, RLS + `has_role()` no Postgres
- TanStack Query (`ensureQueryData` + `useSuspenseQuery`)
- Zod para validação de inputs
- Recharts para gráficos (já compatível edge)
- shadcn: Card, Button, Dialog, Table, Select, Input, Tabs, Badge, Sonner (toasts)

## Fora do escopo desta iteração

- Recuperação de senha
- Impressão de recibo
- Exportação CSV
- Notificações por email

Vou construir na sequência: Cloud + migrations → auth → layout/design system → dashboard → clientes/fornecedores → estoque → vendas → fiado → financeiro → seed.
