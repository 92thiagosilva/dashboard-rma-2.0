import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Usa service_role nas API routes para garantir acesso total sem RLS
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient<Database>(url, key);
}
