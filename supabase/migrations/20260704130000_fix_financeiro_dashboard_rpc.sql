-- Correção da aba Financeiro: usa RPC admin-only para evitar falhas por RLS/filtros no client.
-- Aplicar depois da migration 20260704120000_fix_vendas_estoque_aprovacao.sql.

CREATE OR REPLACE FUNCTION public.financeiro_admin_dados(
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_vendedor_id uuid DEFAULT NULL,
  p_forma_pagamento public.forma_pagamento DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem acessar o financeiro';
  END IF;

  WITH vendas_filtradas AS (
    SELECT v.*
    FROM public.vendas v
    WHERE (p_data_inicio IS NULL OR v.criado_em >= p_data_inicio::timestamptz)
      AND (p_data_fim IS NULL OR v.criado_em < (p_data_fim + 1)::timestamptz)
      AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
      AND (p_forma_pagamento IS NULL OR v.forma_pagamento = p_forma_pagamento)
  ),
  validas AS (
    SELECT *
    FROM vendas_filtradas
    WHERE status <> 'cancelada'::public.venda_status
  ),
  validas_usuario_filtro AS (
    SELECT v.*
    FROM public.vendas v
    WHERE v.status <> 'cancelada'::public.venda_status
      AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
      AND (p_forma_pagamento IS NULL OR v.forma_pagamento = p_forma_pagamento)
  ),
  resumo AS (
    SELECT jsonb_build_object(
      'total_vendido', COALESCE((SELECT SUM(valor_total) FROM validas), 0),
      'custo_total', COALESCE((SELECT SUM(custo_total) FROM validas), 0),
      'lucro_total', COALESCE((SELECT SUM(valor_total - custo_total) FROM validas), 0),
      'total_fiado', COALESCE((SELECT SUM(c.saldo_devedor) FROM public.clientes c), 0),
      'vendas_periodo', COALESCE((SELECT COUNT(*) FROM validas), 0),
      'vendas_canceladas', COALESCE((SELECT COUNT(*) FROM vendas_filtradas WHERE status = 'cancelada'::public.venda_status), 0),
      'total_hoje', COALESCE((SELECT SUM(valor_total) FROM validas_usuario_filtro WHERE criado_em >= CURRENT_DATE::timestamptz), 0),
      'lucro_hoje', COALESCE((SELECT SUM(valor_total - custo_total) FROM validas_usuario_filtro WHERE criado_em >= CURRENT_DATE::timestamptz), 0),
      'total_mes', COALESCE((SELECT SUM(valor_total) FROM validas_usuario_filtro WHERE criado_em >= date_trunc('month', now())), 0),
      'lucro_mes', COALESCE((SELECT SUM(valor_total - custo_total) FROM validas_usuario_filtro WHERE criado_em >= date_trunc('month', now())), 0)
    ) AS data
  ),
  vendas_por_dia AS (
    SELECT COALESCE(jsonb_agg(row_data ORDER BY data_iso), '[]'::jsonb) AS data
    FROM (
      SELECT
        to_char(v.criado_em::date, 'YYYY-MM-DD') AS data_iso,
        to_char(v.criado_em::date, 'DD/MM') AS data,
        COALESCE(SUM(v.valor_total), 0)::numeric AS total,
        COALESCE(SUM(v.valor_total - v.custo_total), 0)::numeric AS lucro
      FROM validas v
      GROUP BY v.criado_em::date
      ORDER BY v.criado_em::date
    ) row_data
  ),
  ranking_vendedores AS (
    SELECT COALESCE(jsonb_agg(row_data ORDER BY total DESC), '[]'::jsonb) AS data
    FROM (
      SELECT
        v.vendedor_id,
        COALESCE(p.nome, 'Vendedor removido') AS nome,
        COALESCE(SUM(v.valor_total), 0)::numeric AS total,
        COALESCE(SUM(v.valor_total - v.custo_total), 0)::numeric AS lucro,
        COUNT(*)::int AS qtd
      FROM validas v
      LEFT JOIN public.profiles p ON p.id = v.vendedor_id
      GROUP BY v.vendedor_id, p.nome
      ORDER BY total DESC
    ) row_data
  ),
  por_forma_pagamento AS (
    SELECT COALESCE(jsonb_agg(row_data ORDER BY forma), '[]'::jsonb) AS data
    FROM (
      SELECT
        f.forma,
        COALESCE(SUM(v.valor_total), 0)::numeric AS total
      FROM (
        VALUES
          ('dinheiro'::public.forma_pagamento),
          ('pix'::public.forma_pagamento),
          ('cartao'::public.forma_pagamento),
          ('fiado'::public.forma_pagamento)
      ) f(forma)
      LEFT JOIN validas v ON v.forma_pagamento = f.forma
      GROUP BY f.forma
      ORDER BY f.forma
    ) row_data
  ),
  vendedores AS (
    SELECT COALESCE(jsonb_agg(row_data ORDER BY nome), '[]'::jsonb) AS data
    FROM (
      SELECT DISTINCT
        p.id,
        p.nome
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE ur.role IN ('admin'::public.app_role, 'vendedor'::public.app_role)
      ORDER BY p.nome
    ) row_data
  )
  SELECT jsonb_build_object(
    'resumo', resumo.data,
    'vendas_por_dia', vendas_por_dia.data,
    'ranking_vendedores', ranking_vendedores.data,
    'por_forma_pagamento', por_forma_pagamento.data,
    'vendedores', vendedores.data
  )
  INTO v_result
  FROM resumo, vendas_por_dia, ranking_vendedores, por_forma_pagamento, vendedores;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_admin_dados(date, date, uuid, public.forma_pagamento) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financeiro_admin_dados(date, date, uuid, public.forma_pagamento) TO authenticated;
