export type Database = {
  public: {
    Tables: {
      vendas: {
        Row: {
          id: string;
          data_venda: string | null;
          cod_produto: string | null;
          descricao_produto: string | null;
          quantidade_vendida: number | null;
          estado: string | null;
          numero_fotus: string | null;
          imported_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["vendas"]["Row"], "id" | "imported_at">;
        Update: Partial<Database["public"]["Tables"]["vendas"]["Insert"]>;
      };
      rma: {
        Row: {
          id: string;
          cod_produto: string | null;
          data_criacao: string | null;
          data_venda: string | null;
          sn: string | null;
          estado: string | null;
          sac: string | null;
          problematica: string | null;
          nro_fotus: string | null;
          produto: string | null;
          classificacao: string | null;
          tipo_alimentacao: string | null;
          potencia: number | null;
          fabricante: string | null;
          ativo: string | null;
          mttf_dias: number | null;
          imported_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["rma"]["Row"], "id" | "mttf_dias" | "imported_at">;
        Update: Partial<Database["public"]["Tables"]["rma"]["Insert"]>;
      };
      mttf_referencia: {
        Row: { produto: string; media_mttf: number | null; ativo: string | null };
        Insert: Database["public"]["Tables"]["mttf_referencia"]["Row"];
        Update: Partial<Database["public"]["Tables"]["mttf_referencia"]["Row"]>;
      };
      import_history: {
        Row: {
          id: string;
          tipo: string | null;
          filename: string | null;
          rows_imported: number | null;
          imported_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["import_history"]["Row"], "id" | "imported_at">;
        Update: never;
      };
    };
  };
};
