import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sessionResponse } from "@/lib/supabase/sessionResponse";

export async function GET() {
  return sessionResponse((await cookies()).getAll(), createClient);
}
