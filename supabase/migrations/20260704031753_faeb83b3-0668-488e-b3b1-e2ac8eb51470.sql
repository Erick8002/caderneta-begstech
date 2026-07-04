
-- Cria uma venda de forma atômica.
-- p_itens: json array [{produto_id: uuid, quantidade: int}]
CREATE OR REPLACE FUNCTION public.criar_venda(
  p_cliente_id uuid,
  p_forma_pagamento forma_pagamento,
  p_itens jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_venda_id uuid;
  v_vendedor uuid := auth.uid();
  v_item jsonb;
  v_produto record;
  v_qtd int;
  v_subtotal numeric(10,2);
  v_custo_item numeric(10,2);
  v_lucro_item numeric(10,2);
  v_total numeric(10,2) := 0;
  v_custo_total numeric(10,2) := 0;
  v_lucro_total numeric(10,2) := 0;
  v_status venda_status;
  v_cliente record;
  v_disponivel numeric(10,2);
BEGIN
  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa de pelo menos um produto';
  END IF;

  IF p_forma_pagamento = 'fiado' THEN
    v_status := 'fiada';
    IF p_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Venda fiada exige cliente cadastrado';
    END IF;
  ELSE
    v_status := 'paga';
  END IF;

  -- Pré-calcular total para validar fiado
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::int;
    SELECT * INTO v_produto FROM public.produtos WHERE id = (v_item->>'produto_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF v_produto.quantidade < v_qtd THEN
      RAISE EXCEPTION 'Estoque insuficiente para %', v_produto.nome;
    END IF;
    v_total := v_total + (v_produto.valor_venda * v_qtd);
  END LOOP;

  -- Validações de fiado
  IF p_forma_pagamento = 'fiado' THEN
    SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
    IF v_cliente.qtd_compras < 2 THEN
      RAISE EXCEPTION 'Cliente só pode comprar fiado a partir da terceira compra (compras atuais: %)', v_cliente.qtd_compras;
    END IF;
    v_disponivel := v_cliente.limite_fiado - v_cliente.saldo_devedor;
    IF v_total > v_disponivel THEN
      RAISE EXCEPTION 'Limite de fiado insuficiente. Disponível: R$ %', to_char(v_disponivel, 'FM999999990.00');
    END IF;
  END IF;

  -- Cria a venda
  INSERT INTO public.vendas (cliente_id, vendedor_id, valor_total, custo_total, lucro_total, forma_pagamento, status)
  VALUES (p_cliente_id, v_vendedor, 0, 0, 0, p_forma_pagamento, v_status)
  RETURNING id INTO v_venda_id;

  -- Insere itens e ajusta estoque
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::int;
    SELECT * INTO v_produto FROM public.produtos WHERE id = (v_item->>'produto_id')::uuid;
    v_subtotal := v_produto.valor_venda * v_qtd;
    v_custo_item := v_produto.valor_custo * v_qtd;
    v_lucro_item := v_subtotal - v_custo_item;

    INSERT INTO public.itens_venda (venda_id, produto_id, quantidade, valor_unitario, valor_custo, subtotal, lucro)
    VALUES (v_venda_id, v_produto.id, v_qtd, v_produto.valor_venda, v_produto.valor_custo, v_subtotal, v_lucro_item);

    UPDATE public.produtos SET quantidade = quantidade - v_qtd WHERE id = v_produto.id;

    v_custo_total := v_custo_total + v_custo_item;
    v_lucro_total := v_lucro_total + v_lucro_item;
  END LOOP;

  UPDATE public.vendas
    SET valor_total = v_total, custo_total = v_custo_total, lucro_total = v_lucro_total
    WHERE id = v_venda_id;

  -- Atualiza cliente
  IF p_cliente_id IS NOT NULL THEN
    UPDATE public.clientes
      SET qtd_compras = qtd_compras + 1,
          saldo_devedor = saldo_devedor + CASE WHEN p_forma_pagamento = 'fiado' THEN v_total ELSE 0 END
      WHERE id = p_cliente_id;
  END IF;

  RETURN v_venda_id;
END;
$$;

-- Cancela venda (admin)
CREATE OR REPLACE FUNCTION public.cancelar_venda(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_venda record;
  v_item record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem cancelar vendas';
  END IF;

  SELECT * INTO v_venda FROM public.vendas WHERE id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF v_venda.status = 'cancelada' THEN RAISE EXCEPTION 'Venda já cancelada'; END IF;

  -- Devolve estoque
  FOR v_item IN SELECT * FROM public.itens_venda WHERE venda_id = p_venda_id LOOP
    UPDATE public.produtos SET quantidade = quantidade + v_item.quantidade WHERE id = v_item.produto_id;
  END LOOP;

  -- Ajusta cliente
  IF v_venda.cliente_id IS NOT NULL THEN
    UPDATE public.clientes
      SET qtd_compras = GREATEST(qtd_compras - 1, 0),
          saldo_devedor = GREATEST(saldo_devedor - CASE WHEN v_venda.status = 'fiada' THEN v_venda.valor_total ELSE 0 END, 0)
      WHERE id = v_venda.cliente_id;
  END IF;

  UPDATE public.vendas SET status = 'cancelada' WHERE id = p_venda_id;
END;
$$;

-- Registra pagamento de fiado (admin)
CREATE OR REPLACE FUNCTION public.registrar_pagamento_fiado(
  p_cliente_id uuid,
  p_valor numeric,
  p_observacao text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_saldo numeric(10,2);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem registrar pagamentos';
  END IF;

  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;

  SELECT saldo_devedor INTO v_saldo FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  IF p_valor > v_saldo THEN RAISE EXCEPTION 'Valor maior que o saldo devedor'; END IF;

  INSERT INTO public.pagamentos_fiado (cliente_id, valor_pago, observacao, registrado_por)
  VALUES (p_cliente_id, p_valor, p_observacao, auth.uid())
  RETURNING id INTO v_id;

  UPDATE public.clientes SET saldo_devedor = saldo_devedor - p_valor WHERE id = p_cliente_id;

  RETURN v_id;
END;
$$;

-- Alterar limite de fiado (admin)
CREATE OR REPLACE FUNCTION public.alterar_limite_fiado(p_cliente_id uuid, p_novo_limite numeric)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o limite de fiado';
  END IF;
  IF p_novo_limite < 0 THEN RAISE EXCEPTION 'Limite deve ser não-negativo'; END IF;
  UPDATE public.clientes SET limite_fiado = p_novo_limite WHERE id = p_cliente_id;
END;
$$;
