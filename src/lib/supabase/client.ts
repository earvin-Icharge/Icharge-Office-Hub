import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for the browser (used only for direct file uploads with one-time links). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
