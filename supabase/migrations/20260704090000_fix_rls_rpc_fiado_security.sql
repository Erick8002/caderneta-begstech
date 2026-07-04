-- Correções críticas de segurança, RLS e regras de fiado para Caderneta Digital BEGSTech
-- Aplicar depois das migrations existentes.

-- =========================================================
-- Helpers de autorização
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false);
$$;

CREATE OR REPLACE FUNCTION public.is_vendedor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.has_role(auth.uid(), 'vendedor'::public.app_role), false);
$$;

-- =========================================================
-- FK de vendas: histórico não deve perder vendedor
-- =========================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'vendas'
      AND constraint_name = 'vendas_vendedor_id_fkey'
  ) THEN
    ALTER TABLE public.vendas DROP CONSTRAINT vendas_vendedor_id_fkey;
  END IF;

  ALTER TABLE public.vendas
    ADD CONSTRAINT vendas_vendedor_id_fkey
    FOREIGN KEY (vendedor_id)
    REFERENCES auth.users(id)
    ON DELETE RESTRICT;
END $$;

-- =========================================================
-- RLS: remove policies antigas e recria mínimo necessário
-- =========================================================
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS user_roles_select_authenticated ON public.user_roles;
DROP POLICY IF EXISTS fornecedores_select_all ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_insert_authenticated ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_update_admin ON public.fornecedores;
DROP POLICY IF EXISTS fornecedores_delete_admin ON public.fornecedores;
DROP POLICY IF EXISTS clientes_select_all ON public.clientes;
DROP POLICY IF EXISTS clientes_insert_authenticated ON public.clientes;
DROP POLICY IF EXISTS clientes_update_admin ON public.clientes;
DROP POLICY IF EXISTS clientes_delete_admin ON public.clientes;
DROP POLICY IF EXISTS produtos_select_all ON public.produtos;
DROP POLICY IF EXISTS produtos_insert_authenticated ON public.produtos;
DROP POLICY IF EXISTS produtos_update_authenticated ON public.produtos;
DROP POLICY IF EXISTS produtos_delete_admin ON public.produtos;
DROP POLICY IF EXISTS vendas_select_own_or_admin ON public.vendas;
DROP POLICY IF EXISTS vendas_insert_authenticated ON public.vendas;
DROP POLICY IF EXISTS vendas_update_admin ON public.vendas;
DROP POLICY IF EXISTS vendas_delete_admin ON public.vendas;
DROP POLICY IF EXISTS itens_venda_select ON public.itens_venda;
DROP POLICY IF EXISTS itens_venda_insert ON public.itens_venda;
DROP POLICY IF EXISTS pagamentos_fiado_select ON public.pagamentos_fiado;
DROP POLICY IF EXISTS pagamentos_fiado_insert_admin ON public.pagamentos_fiado;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_fiado ENABLE ROW LEVEL SECURITY;

-- Profiles: usuário vê/edita a si mesmo; admin vê todos.
CREATE POLICY profiles_select_own_or_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own_or_admin
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.is_admin())
WITH CHECK (id = auth.uid() OR public.is_admin());

-- Roles: usuário vê o próprio papel; admin vê todos.
CREATE POLICY user_roles_select_own_or_admin
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- Fornecedores: vendedor consulta; admin gerencia.
CREATE POLICY fornecedores_select_authenticated
ON public.fornecedores
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY fornecedores_insert_admin
ON public.fornecedores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY fornecedores_update_admin
ON public.fornecedores
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY fornecedores_delete_admin
ON public.fornecedores
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Clientes: vendedor pode cadastrar/consultar; admin edita/remove.
CREATE POLICY clientes_select_authenticated
ON public.clientes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY clientes_insert_authenticated
ON public.clientes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY clientes_update_admin
ON public.clientes
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY clientes_delete_admin
ON public.clientes
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Produtos: vendedor consulta estoque; admin gerencia.
CREATE POLICY produtos_select_authenticated
ON public.produtos
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY produtos_insert_admin
ON public.produtos
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY produtos_update_admin
ON public.produtos
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY produtos_delete_admin
ON public.produtos
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Vendas: leitura própria ou admin. Escrita sensível passa por RPC SECURITY DEFINER.
CREATE POLICY vendas_select_own_or_admin
ON public.vendas
FOR SELECT
TO authenticated
USING (vendedor_id = auth.uid() OR public.is_admin());

CREATE POLICY vendas_update_admin
ON public.vendas
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY vendas_delete_admin
ON public.vendas
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Itens: leitura acompanha venda. Escrita passa pela RPC criar_venda.
CREATE POLICY itens_venda_select_own_or_admin
ON public.itens_venda
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = itens_venda.venda_id
      AND (v.vendedor_id = auth.uid() OR public.is_admin())
  )
);

-- Pagamentos: vendedor pode consultar histórico; somente RPC/admin registra.
CREATE POLICY pagamentos_fiado_select_authenticated
ON public.pagamentos_fiado
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY pagamentos_fiado_insert_admin
ON public.pagamentos_fiado
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- =========================================================
-- RPC: criar venda atômica com RLS ativo
-- =========================================================
CREATE OR REPLACE FUNCTION public.criar_venda(
  p_cliente_id uuid DEFAULT NULL,
  p_forma_pagamento public.forma_pagamento DEFAULT 'dinheiro'::public.forma_pagamento,
  p_itens jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_venda_id uuid;
  v_vendedor uuid := auth.uid();
  v_linha record;
  v_produto record;
  v_status public.venda_status;
  v_total numeric(10,2) := 0;
  v_custo_total numeric(10,2) := 0;
  v_lucro_total numeric(10,2) := 0;
  v_subtotal numeric(10,2);
  v_custo_item numeric(10,2);
  v_lucro_item numeric(10,2);
  v_cliente record;
  v_disponivel numeric(10,2);
BEGIN
  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (public.has_role(v_vendedor, 'admin'::public.app_role) OR public.has_role(v_vendedor, 'vendedor'::public.app_role)) THEN
    RAISE EXCEPTION 'Usuário sem perfil autorizado para vender';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa de pelo menos um produto';
  END IF;

  IF p_forma_pagamento = 'fiado'::public.forma_pagamento THEN
    v_status := 'fiada'::public.venda_status;
    IF p_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Venda fiada exige cliente cadastrado';
    END IF;
  ELSE
    v_status := 'paga'::public.venda_status;
  END IF;

  -- Valida produtos agregando itens duplicados para evitar estoque negativo.
  FOR v_linha IN
    SELECT x.produto_id, SUM(x.quantidade)::int AS quantidade
    FROM jsonb_to_recordset(p_itens) AS x(produto_id uuid, quantidade int)
    GROUP BY x.produto_id
  LOOP
    IF v_linha.produto_id IS NULL OR v_linha.quantidade IS NULL OR v_linha.quantidade <= 0 THEN
      RAISE EXCEPTION 'Item inválido na venda';
    END IF;

    SELECT *
    INTO v_produto
    FROM public.produtos
    WHERE id = v_linha.produto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado';
    END IF;

    IF COALESCE(v_produto.status, 'ativo') <> 'ativo' THEN
      RAISE EXCEPTION 'Produto % não está ativo', v_produto.nome;
    END IF;

    IF v_produto.quantidade < v_linha.quantidade THEN
      RAISE EXCEPTION 'Estoque insuficiente para %', v_produto.nome;
    END IF;

    v_total := v_total + (v_produto.valor_venda * v_linha.quantidade);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Total da venda deve ser positivo';
  END IF;

  -- Regra de fiado: somente cliente cadastrado com 3+ compras e limite disponível.
  IF p_forma_pagamento = 'fiado'::public.forma_pagamento THEN
    SELECT *
    INTO v_cliente
    FROM public.clientes
    WHERE id = p_cliente_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado';
    END IF;

    IF v_cliente.qtd_compras < 3 THEN
      RAISE EXCEPTION 'Cliente só pode comprar fiado a partir da terceira compra (compras atuais: %)', v_cliente.qtd_compras;
    END IF;

    v_disponivel := v_cliente.limite_fiado - v_cliente.saldo_devedor;
    IF v_total > v_disponivel THEN
      RAISE EXCEPTION 'Limite de fiado insuficiente. Disponível: R$ %', to_char(v_disponivel, 'FM999999990.00');
    END IF;
  ELSIF p_cliente_id IS NOT NULL THEN
    SELECT *
    INTO v_cliente
    FROM public.clientes
    WHERE id = p_cliente_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado';
    END IF;
  END IF;

  INSERT INTO public.vendas (
    cliente_id,
    vendedor_id,
    valor_total,
    custo_total,
    lucro_total,
    forma_pagamento,
    status
  ) VALUES (
    p_cliente_id,
    v_vendedor,
    0,
    0,
    0,
    p_forma_pagamento,
    v_status
  ) RETURNING id INTO v_venda_id;

  FOR v_linha IN
    SELECT x.produto_id, SUM(x.quantidade)::int AS quantidade
    FROM jsonb_to_recordset(p_itens) AS x(produto_id uuid, quantidade int)
    GROUP BY x.produto_id
  LOOP
    SELECT *
    INTO v_produto
    FROM public.produtos
    WHERE id = v_linha.produto_id
    FOR UPDATE;

    v_subtotal := v_produto.valor_venda * v_linha.quantidade;
    v_custo_item := v_produto.valor_custo * v_linha.quantidade;
    v_lucro_item := v_subtotal - v_custo_item;

    INSERT INTO public.itens_venda (
      venda_id,
      produto_id,
      quantidade,
      valor_unitario,
      valor_custo,
      subtotal,
      lucro
    ) VALUES (
      v_venda_id,
      v_produto.id,
      v_linha.quantidade,
      v_produto.valor_venda,
      v_produto.valor_custo,
      v_subtotal,
      v_lucro_item
    );

    UPDATE public.produtos
    SET quantidade = quantidade - v_linha.quantidade
    WHERE id = v_produto.id;

    v_custo_total := v_custo_total + v_custo_item;
    v_lucro_total := v_lucro_total + v_lucro_item;
  END LOOP;

  UPDATE public.vendas
  SET valor_total = v_total,
      custo_total = v_custo_total,
      lucro_total = v_lucro_total
  WHERE id = v_venda_id;

  IF p_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET qtd_compras = qtd_compras + 1,
        saldo_devedor = saldo_devedor + CASE
          WHEN p_forma_pagamento = 'fiado'::public.forma_pagamento THEN v_total
          ELSE 0
        END
    WHERE id = p_cliente_id;
  END IF;

  RETURN v_venda_id;
END;
$$;

-- =========================================================
-- RPC: cancelar venda, admin-only
-- =========================================================
CREATE OR REPLACE FUNCTION public.cancelar_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_venda record;
  v_item record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem cancelar vendas';
  END IF;

  SELECT *
  INTO v_venda
  FROM public.vendas
  WHERE id = p_venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;

  IF v_venda.status = 'cancelada'::public.venda_status THEN
    RAISE EXCEPTION 'Venda já cancelada';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.itens_venda
    WHERE venda_id = p_venda_id
  LOOP
    UPDATE public.produtos
    SET quantidade = quantidade + v_item.quantidade
    WHERE id = v_item.produto_id;
  END LOOP;

  IF v_venda.cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET qtd_compras = GREATEST(qtd_compras - 1, 0),
        saldo_devedor = GREATEST(
          saldo_devedor - CASE
            WHEN v_venda.status = 'fiada'::public.venda_status THEN v_venda.valor_total
            ELSE 0
          END,
          0
        )
    WHERE id = v_venda.cliente_id;
  END IF;

  UPDATE public.vendas
  SET status = 'cancelada'::public.venda_status
  WHERE id = p_venda_id;
END;
$$;

-- =========================================================
-- RPC: registrar pagamento de fiado, admin-only, venda opcional
-- Remove assinatura antiga SECURITY INVOKER para evitar overload ambíguo/inseguro.
-- =========================================================
DROP FUNCTION IF EXISTS public.registrar_pagamento_fiado(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.registrar_pagamento_fiado(
  p_cliente_id uuid,
  p_valor numeric,
  p_observacao text DEFAULT NULL,
  p_venda_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_saldo numeric(10,2);
  v_venda record;
  v_pago_venda numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem registrar pagamentos';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  SELECT saldo_devedor
  INTO v_saldo
  FROM public.clientes
  WHERE id = p_cliente_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  IF p_valor > v_saldo THEN
    RAISE EXCEPTION 'Valor maior que o saldo devedor';
  END IF;

  IF p_venda_id IS NOT NULL THEN
    SELECT *
    INTO v_venda
    FROM public.vendas
    WHERE id = p_venda_id
      AND cliente_id = p_cliente_id
      AND status = 'fiada'::public.venda_status
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Venda fiada não encontrada para este cliente';
    END IF;

    SELECT COALESCE(SUM(valor_pago), 0)
    INTO v_pago_venda
    FROM public.pagamentos_fiado
    WHERE venda_id = p_venda_id;

    IF v_pago_venda + p_valor > v_venda.valor_total THEN
      RAISE EXCEPTION 'Pagamento ultrapassa o valor pendente desta venda';
    END IF;
  END IF;

  INSERT INTO public.pagamentos_fiado (
    cliente_id,
    venda_id,
    valor_pago,
    observacao,
    registrado_por
  ) VALUES (
    p_cliente_id,
    p_venda_id,
    p_valor,
    p_observacao,
    auth.uid()
  ) RETURNING id INTO v_id;

  UPDATE public.clientes
  SET saldo_devedor = saldo_devedor - p_valor
  WHERE id = p_cliente_id;

  RETURN v_id;
END;
$$;

-- =========================================================
-- RPC: alterar limite de fiado, admin-only
-- =========================================================
CREATE OR REPLACE FUNCTION public.alterar_limite_fiado(
  p_cliente_id uuid,
  p_novo_limite numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o limite de fiado';
  END IF;

  IF p_novo_limite IS NULL OR p_novo_limite < 0 THEN
    RAISE EXCEPTION 'Limite deve ser não-negativo';
  END IF;

  UPDATE public.clientes
  SET limite_fiado = p_novo_limite
  WHERE id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;
END;
$$;

-- =========================================================
-- RPC opcional para financeiro admin-only
-- =========================================================
CREATE OR REPLACE FUNCTION public.relatorio_financeiro_admin(
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL,
  p_vendedor_id uuid DEFAULT NULL,
  p_forma_pagamento public.forma_pagamento DEFAULT NULL
)
RETURNS TABLE (
  total_vendas bigint,
  faturamento numeric,
  custo_total numeric,
  lucro_total numeric,
  total_fiado_aberto numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem acessar o financeiro';
  END IF;

  RETURN QUERY
  WITH vendas_filtradas AS (
    SELECT v.*
    FROM public.vendas v
    WHERE v.status <> 'cancelada'::public.venda_status
      AND (p_data_inicio IS NULL OR v.criado_em >= p_data_inicio::timestamptz)
      AND (p_data_fim IS NULL OR v.criado_em < (p_data_fim + 1)::timestamptz)
      AND (p_vendedor_id IS NULL OR v.vendedor_id = p_vendedor_id)
      AND (p_forma_pagamento IS NULL OR v.forma_pagamento = p_forma_pagamento)
  )
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(valor_total), 0)::numeric,
    COALESCE(SUM(custo_total), 0)::numeric,
    COALESCE(SUM(valor_total - custo_total), 0)::numeric,
    (SELECT COALESCE(SUM(c.saldo_devedor), 0)::numeric FROM public.clientes c);
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_resumo()
RETURNS TABLE (
  vendas_hoje bigint,
  faturamento_hoje numeric,
  fiado_aberto numeric,
  estoque_baixo bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  v_admin := public.is_admin();

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint
     FROM public.vendas v
     WHERE v.status <> 'cancelada'::public.venda_status
       AND v.criado_em >= CURRENT_DATE::timestamptz
       AND (v_admin OR v.vendedor_id = v_user)),
    (SELECT COALESCE(SUM(v.valor_total), 0)::numeric
     FROM public.vendas v
     WHERE v.status <> 'cancelada'::public.venda_status
       AND v.criado_em >= CURRENT_DATE::timestamptz
       AND (v_admin OR v.vendedor_id = v_user)),
    (SELECT COALESCE(SUM(c.saldo_devedor), 0)::numeric FROM public.clientes c),
    (SELECT COUNT(*)::bigint FROM public.produtos p WHERE p.quantidade <= p.estoque_minimo);
END;
$$;

-- Permissões de execução das RPCs
REVOKE ALL ON FUNCTION public.criar_venda(uuid, public.forma_pagamento, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_venda(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_pagamento_fiado(uuid, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.alterar_limite_fiado(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.relatorio_financeiro_admin(date, date, uuid, public.forma_pagamento) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_resumo() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.criar_venda(uuid, public.forma_pagamento, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_venda(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_fiado(uuid, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_limite_fiado(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.relatorio_financeiro_admin(date, date, uuid, public.forma_pagamento) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_resumo() TO authenticated;
