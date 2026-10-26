import { telegramDrainResponse } from "@/lib/ops/telegramDrainResponse";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return telegramDrainResponse(request);
}
