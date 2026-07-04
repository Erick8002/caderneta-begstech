-- Correções finais: total da venda, recebimento de estoque e aprovação de vendedores.
-- Aplicar depois das migrations anteriores.

-- =========================================================
-- Fluxo de aprovação de vendedores
-- =========================================================
DO $$
BEGIN
  CREATE TYPE public.solicitacao_status AS ENUM ('pendente', 'aprovado', 'rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.solicitacoes_vendedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  status public.solicitacao_status NOT NULL DEFAULT 'pendente',
  criado_em timestamptz NOT NULL DEFAULT now(),
  analisado_em timestamptz,
  analisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text
);

GRANT SELECT ON public.solicitacoes_vendedor TO authenticated;
GRANT ALL ON public.solicitacoes_vendedor TO service_role;
ALTER TABLE public.solicitacoes_vendedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitacoes_select_own_or_admin ON public.solicitacoes_vendedor;
DROP POLICY IF EXISTS solicitacoes_update_admin ON public.solicitacoes_vendedor;

CREATE POLICY solicitacoes_select_own_or_admin
ON public.solicitacoes_vendedor
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY solicitacoes_update_admin
ON public.solicitacoes_vendedor
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Novo usuário: primeiro usuário vira admin; os demais ficam pendentes para aprovação.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_count int;
  v_nome text;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, v_nome, NEW.email)
  ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      email = EXCLUDED.email;

  SELECT count(*)
  INTO v_admin_count
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role;

  IF v_admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.solicitacoes_vendedor (user_id, nome, email, status)
    VALUES (NEW.id, v_nome, NEW.email, 'pendente'::public.solicitacao_status)
    ON CONFLICT (user_id) DO UPDATE
    SET nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        status = CASE
          WHEN public.solicitacoes_vendedor.status = 'aprovado'::public.solicitacao_status
          THEN public.solicitacoes_vendedor.status
          ELSE 'pendente'::public.solicitacao_status
        END,
        analisado_em = CASE
          WHEN public.solicitacoes_vendedor.status = 'aprovado'::public.solicitacao_status
          THEN public.solicitacoes_vendedor.analisado_em
          ELSE NULL
        END,
        analisado_por = CASE
          WHEN public.solicitacoes_vendedor.status = 'aprovado'::public.solicitacao_status
          THEN public.solicitacoes_vendedor.analisado_por
          ELSE NULL
        END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.aprovar_vendedor(p_user_id uuid)
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
    RAISE EXCEPTION 'Apenas administradores podem aprovar vendedores';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Administrador não precisa de aprovação como vendedor';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'vendedor'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.solicitacoes_vendedor
  SET status = 'aprovado'::public.solicitacao_status,
      analisado_em = now(),
      analisado_por = auth.uid(),
      observacao = COALESCE(observacao, 'Aprovado pelo administrador')
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.solicitacoes_vendedor (user_id, nome, email, status, analisado_em, analisado_por, observacao)
    SELECT p.id, p.nome, p.email, 'aprovado'::public.solicitacao_status, now(), auth.uid(), 'Aprovado pelo administrador'
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Perfil do usuário não encontrado';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rejeitar_vendedor(p_user_id uuid, p_observacao text DEFAULT NULL)
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
    RAISE EXCEPTION 'Apenas administradores podem rejeitar vendedores';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role = 'vendedor'::public.app_role;

  UPDATE public.solicitacoes_vendedor
  SET status = 'rejeitado'::public.solicitacao_status,
      analisado_em = now(),
      analisado_por = auth.uid(),
      observacao = COALESCE(p_observacao, 'Rejeitado pelo administrador')
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.solicitacoes_vendedor (user_id, nome, email, status, analisado_em, analisado_por, observacao)
    SELECT p.id, p.nome, p.email, 'rejeitado'::public.solicitacao_status, now(), auth.uid(), COALESCE(p_observacao, 'Rejeitado pelo administrador')
    FROM public.profiles p
    WHERE p.id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Perfil do usuário não encontrado';
    END IF;
  END IF;
END;
$$;

-- =========================================================
-- Backfill: corrige vendas antigas que ficaram com total zerado.
-- =========================================================
WITH totais AS (
  SELECT
    venda_id,
    COALESCE(SUM(subtotal), 0)::numeric(10,2) AS valor_total,
    COALESCE(SUM(valor_custo * quantidade), 0)::numeric(10,2) AS custo_total,
    COALESCE(SUM(lucro), 0)::numeric(10,2) AS lucro_total
  FROM public.itens_venda
  GROUP BY venda_id
)
UPDATE public.vendas v
SET valor_total = t.valor_total,
    custo_total = t.custo_total,
    lucro_total = t.lucro_total
FROM totais t
WHERE v.id = t.venda_id
  AND (
    COALESCE(v.valor_total, 0) <> t.valor_total
    OR COALESCE(v.custo_total, 0) <> t.custo_total
    OR COALESCE(v.lucro_total, 0) <> t.lucro_total
  );

-- =========================================================
-- RPC: criar venda com total/custo/lucro persistidos no INSERT.
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
    RAISE EXCEPTION 'Usuário ainda não aprovado para vender';
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

  FOR v_linha IN
    SELECT x.produto_id, SUM(x.quantidade)::int AS quantidade
    FROM jsonb_to_recordset(p_itens) AS x(produto_id uuid, quantidade int)
    GROUP BY x.produto_id
  LOOP
    IF v_linha.produto_id IS NULL OR v_linha.quantidade IS NULL OR v_linha.quantidade <= 0 THEN
      RAISE EXCEPTION 'Item inválido na venda';
    END IF;

    SELECT * INTO v_produto
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

    v_subtotal := v_produto.valor_venda * v_linha.quantidade;
    v_custo_item := v_produto.valor_custo * v_linha.quantidade;
    v_lucro_item := v_subtotal - v_custo_item;

    v_total := v_total + v_subtotal;
    v_custo_total := v_custo_total + v_custo_item;
    v_lucro_total := v_lucro_total + v_lucro_item;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Total da venda deve ser positivo';
  END IF;

  IF p_forma_pagamento = 'fiado'::public.forma_pagamento THEN
    SELECT * INTO v_cliente
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
    SELECT * INTO v_cliente
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
    v_total,
    v_custo_total,
    v_lucro_total,
    p_forma_pagamento,
    v_status
  ) RETURNING id INTO v_venda_id;

  FOR v_linha IN
    SELECT x.produto_id, SUM(x.quantidade)::int AS quantidade
    FROM jsonb_to_recordset(p_itens) AS x(produto_id uuid, quantidade int)
    GROUP BY x.produto_id
  LOOP
    SELECT * INTO v_produto
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
  END LOOP;

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
-- RPC: receber estoque de produto existente, admin-only.
-- =========================================================
CREATE OR REPLACE FUNCTION public.receber_estoque_produto(
  p_produto_id uuid,
  p_quantidade int,
  p_valor_custo numeric DEFAULT NULL,
  p_atualizar_custo boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_produto record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem receber estoque';
  END IF;

  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'Produto inválido';
  END IF;

  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade recebida deve ser maior que zero';
  END IF;

  IF p_valor_custo IS NOT NULL AND p_valor_custo < 0 THEN
    RAISE EXCEPTION 'Valor de custo inválido';
  END IF;

  SELECT * INTO v_produto
  FROM public.produtos
  WHERE id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  UPDATE public.produtos
  SET quantidade = quantidade + p_quantidade,
      ultima_compra = CURRENT_DATE,
      valor_custo = CASE
        WHEN p_atualizar_custo AND p_valor_custo IS NOT NULL THEN p_valor_custo
        ELSE valor_custo
      END
  WHERE id = p_produto_id;
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_vendedor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rejeitar_vendedor(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receber_estoque_produto(uuid, int, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_venda(uuid, public.forma_pagamento, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.aprovar_vendedor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_vendedor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_estoque_produto(uuid, int, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_venda(uuid, public.forma_pagamento, jsonb) TO authenticated;
