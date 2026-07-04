export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clientes: {
        Row: {
          cpf: string | null
          criado_em: string
          id: string
          limite_fiado: number
          nome: string
          qtd_compras: number
          saldo_devedor: number
          telefone: string | null
        }
        Insert: {
          cpf?: string | null
          criado_em?: string
          id?: string
          limite_fiado?: number
          nome: string
          qtd_compras?: number
          saldo_devedor?: number
          telefone?: string | null
        }
        Update: {
          cpf?: string | null
          criado_em?: string
          id?: string
          limite_fiado?: number
          nome?: string
          qtd_compras?: number
          saldo_devedor?: number
          telefone?: string | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          cnpj: string | null
          criado_em: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
        }
        Insert: {
          cnpj?: string | null
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
        }
        Update: {
          cnpj?: string | null
          criado_em?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      itens_venda: {
        Row: {
          id: string
          lucro: number
          produto_id: string
          quantidade: number
          subtotal: number
          valor_custo: number
          valor_unitario: number
          venda_id: string
        }
        Insert: {
          id?: string
          lucro: number
          produto_id: string
          quantidade: number
          subtotal: number
          valor_custo: number
          valor_unitario: number
          venda_id: string
        }
        Update: {
          id?: string
          lucro?: number
          produto_id?: string
          quantidade?: number
          subtotal?: number
          valor_custo?: number
          valor_unitario?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_fiado: {
        Row: {
          cliente_id: string
          data_pagamento: string
          id: string
          observacao: string | null
          registrado_por: string | null
          valor_pago: number
          venda_id: string | null
        }
        Insert: {
          cliente_id: string
          data_pagamento?: string
          id?: string
          observacao?: string | null
          registrado_por?: string | null
          valor_pago: number
          venda_id?: string | null
        }
        Update: {
          cliente_id?: string
          data_pagamento?: string
          id?: string
          observacao?: string | null
          registrado_por?: string | null
          valor_pago?: number
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_fiado_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_fiado_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string | null
          criado_em: string
          estoque_minimo: number
          fornecedor_id: string | null
          id: string
          nome: string
          quantidade: number
          sku: string | null
          status: string
          sugestao_novo_pedido: string | null
          ultima_compra: string | null
          valor_custo: number
          valor_venda: number
        }
        Insert: {
          categoria?: string | null
          criado_em?: string
          estoque_minimo?: number
          fornecedor_id?: string | null
          id?: string
          nome: string
          quantidade?: number
          sku?: string | null
          status?: string
          sugestao_novo_pedido?: string | null
          ultima_compra?: string | null
          valor_custo?: number
          valor_venda?: number
        }
        Update: {
          categoria?: string | null
          criado_em?: string
          estoque_minimo?: number
          fornecedor_id?: string | null
          id?: string
          nome?: string
          quantidade?: number
          sku?: string | null
          status?: string
          sugestao_novo_pedido?: string | null
          ultima_compra?: string | null
          valor_custo?: number
          valor_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          criado_em: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          criado_em?: string
          email: string
          id: string
          nome: string
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendas: {
        Row: {
          cliente_id: string | null
          criado_em: string
          custo_total: number
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id: string
          lucro_total: number
          status: Database["public"]["Enums"]["venda_status"]
          valor_total: number
          vendedor_id: string
        }
        Insert: {
          cliente_id?: string | null
          criado_em?: string
          custo_total?: number
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          lucro_total?: number
          status: Database["public"]["Enums"]["venda_status"]
          valor_total?: number
          vendedor_id: string
        }
        Update: {
          cliente_id?: string | null
          criado_em?: string
          custo_total?: number
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          lucro_total?: number
          status?: Database["public"]["Enums"]["venda_status"]
          valor_total?: number
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "vendedor"
      forma_pagamento: "dinheiro" | "pix" | "cartao" | "fiado"
      venda_status: "paga" | "fiada" | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendedor"],
      forma_pagamento: ["dinheiro", "pix", "cartao", "fiado"],
      venda_status: ["paga", "fiada", "cancelada"],
    },
  },
} as const
