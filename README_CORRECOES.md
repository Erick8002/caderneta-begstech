# Correções aplicadas — Caderneta Digital BEGSTech

Este pacote corrige os pontos pedidos sem refazer o app do zero.

## O que foi corrigido

- Venda nova agora calcula e salva `valor_total`, `custo_total` e `lucro_total` no banco.
- Vendas antigas com total zerado são recalculadas pela migration nova.
- Tela de detalhes da venda também calcula o total pelos itens como fallback, evitando `R$ 0,00` quando há itens.
- Regra do fiado corrigida para liberar somente com 3 ou mais compras.
- Administrador pode aumentar ou diminuir limite de fiado em `/clientes/$id` e também pela tela `/fiado` para clientes devedores.
- Administrador pode receber estoque de produto já cadastrado em `/estoque` e `/estoque/$id`.
- Entrada de estoque usa RPC segura `receber_estoque_produto` e atualiza `ultima_compra`.
- Novo fluxo de aprovação de vendedores:
  - primeiro usuário continua virando administrador;
  - próximos cadastros ficam pendentes;
  - admin recebe aviso no menu/topo;
  - admin aprova ou rejeita em `/admin/aprovacoes`;
  - usuário pendente fica bloqueado até aprovação.
- `.env` não deve ser enviado. Use `.env.example` como modelo.
- Build testado com sucesso.
- Lint testado sem erros, apenas warnings antigos de Fast Refresh nos componentes shadcn/ui.

## Migration nova

A migration principal nova é:

```txt
supabase/migrations/20260704120000_fix_vendas_estoque_aprovacao.sql
```

Aplique essa migration no Supabase/Lovable antes de testar as telas novas.

## Como aplicar

Depois de copiar os arquivos para o repositório:

```bash
npm install
npm run build
npm run lint
```

Para o banco, aplique a migration pelo Supabase CLI:

```bash
supabase db push
```

Ou copie o conteúdo do arquivo SQL e cole no SQL Editor do Supabase/Lovable.

## Importante sobre confirmação por e-mail

O app agora usa aprovação por administrador para vendedores. Porém, se o Supabase Auth estiver configurado para exigir confirmação de e-mail, essa exigência ainda acontece antes do login. Para remover isso, desative a confirmação de e-mail nas configurações do Supabase Auth.

## Resultado dos testes locais neste pacote

```txt
npm run build: OK
npm run lint: OK, com 6 warnings antigos de react-refresh/only-export-components em componentes shadcn/ui
```

## Correção adicional do Financeiro

Arquivo novo:

- `supabase/migrations/20260704130000_fix_financeiro_dashboard_rpc.sql`

Alterações:

- A página `/financeiro` agora busca os dados por uma RPC admin-only (`financeiro_admin_dados`) em vez de consultar várias tabelas diretamente pelo client.
- Isso evita que RLS ou joins do client deixem a tela vazia.
- A tela mostra mensagem de erro se a RPC ainda não tiver sido aplicada no Supabase.
- Gráficos exibem estado vazio quando não houver vendas no período selecionado.

Depois de subir os arquivos, aplique a migration nova no SQL Editor do Supabase:

`supabase/migrations/20260704130000_fix_financeiro_dashboard_rpc.sql`
