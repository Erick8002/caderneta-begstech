
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor');
CREATE TYPE public.forma_pagamento AS ENUM ('dinheiro', 'pix', 'cartao', 'fiado');
CREATE TYPE public.venda_status AS ENUM ('paga', 'fiada', 'cancelada');

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- =========================
-- TRIGGER: novo usuário
-- Primeiro usuário vira admin; demais viram vendedor.
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
  v_role app_role;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  SELECT count(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    v_role := 'admin';
  ELSE
    v_role := 'vendedor';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- FORNECEDORES
-- =========================
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  cnpj text,
  endereco text,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fornecedores_select_all" ON public.fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "fornecedores_insert_authenticated" ON public.fornecedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fornecedores_update_admin" ON public.fornecedores FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "fornecedores_delete_admin" ON public.fornecedores FOR DELETE TO authenticated USING (public.is_admin());

-- =========================
-- CLIENTES
-- =========================
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  cpf text,
  qtd_compras int NOT NULL DEFAULT 0,
  limite_fiado numeric(10,2) NOT NULL DEFAULT 100.00,
  saldo_devedor numeric(10,2) NOT NULL DEFAULT 0.00,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select_all" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_insert_authenticated" ON public.clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clientes_update_admin" ON public.clientes FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "clientes_delete_admin" ON public.clientes FOR DELETE TO authenticated USING (public.is_admin());

-- =========================
-- PRODUTOS
-- =========================
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  sku text,
  categoria text,
  quantidade int NOT NULL DEFAULT 0,
  estoque_minimo int NOT NULL DEFAULT 0,
  valor_custo numeric(10,2) NOT NULL DEFAULT 0.00,
  valor_venda numeric(10,2) NOT NULL DEFAULT 0.00,
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  ultima_compra date,
  sugestao_novo_pedido date,
  status text NOT NULL DEFAULT 'ativo',
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_select_all" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "produtos_insert_authenticated" ON public.produtos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "produtos_update_authenticated" ON public.produtos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "produtos_delete_admin" ON public.produtos FOR DELETE TO authenticated USING (public.is_admin());

-- =========================
-- VENDAS
-- =========================
CREATE TABLE public.vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  vendedor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  valor_total numeric(10,2) NOT NULL DEFAULT 0.00,
  custo_total numeric(10,2) NOT NULL DEFAULT 0.00,
  lucro_total numeric(10,2) NOT NULL DEFAULT 0.00,
  forma_pagamento forma_pagamento NOT NULL,
  status venda_status NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendas TO authenticated;
GRANT ALL ON public.vendas TO service_role;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendas_select_own_or_admin" ON public.vendas FOR SELECT TO authenticated
  USING (vendedor_id = auth.uid() OR public.is_admin());
CREATE POLICY "vendas_insert_authenticated" ON public.vendas FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = auth.uid());
CREATE POLICY "vendas_update_admin" ON public.vendas FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "vendas_delete_admin" ON public.vendas FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX idx_vendas_vendedor ON public.vendas(vendedor_id);
CREATE INDEX idx_vendas_cliente ON public.vendas(cliente_id);
CREATE INDEX idx_vendas_data ON public.vendas(criado_em);

-- =========================
-- ITENS DA VENDA
-- =========================
CREATE TABLE public.itens_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade int NOT NULL,
  valor_unitario numeric(10,2) NOT NULL,
  valor_custo numeric(10,2) NOT NULL,
  subtotal numeric(10,2) NOT NULL,
  lucro numeric(10,2) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens_venda TO authenticated;
GRANT ALL ON public.itens_venda TO service_role;
ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "itens_venda_select" ON public.itens_venda FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND (v.vendedor_id = auth.uid() OR public.is_admin())));
CREATE POLICY "itens_venda_insert" ON public.itens_venda FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = venda_id AND v.vendedor_id = auth.uid()));

CREATE INDEX idx_itens_venda_venda ON public.itens_venda(venda_id);
CREATE INDEX idx_itens_venda_produto ON public.itens_venda(produto_id);

-- =========================
-- PAGAMENTOS DE FIADO
-- =========================
CREATE TABLE public.pagamentos_fiado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  venda_id uuid REFERENCES public.vendas(id) ON DELETE SET NULL,
  valor_pago numeric(10,2) NOT NULL,
  data_pagamento timestamptz NOT NULL DEFAULT now(),
  observacao text,
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagamentos_fiado TO authenticated;
GRANT ALL ON public.pagamentos_fiado TO service_role;
ALTER TABLE public.pagamentos_fiado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pagamentos_fiado_select" ON public.pagamentos_fiado FOR SELECT TO authenticated USING (true);
CREATE POLICY "pagamentos_fiado_insert_admin" ON public.pagamentos_fiado FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
