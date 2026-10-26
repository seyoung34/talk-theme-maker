import { exportSweepResponse } from "@/lib/ops/exportSweepResponse";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return exportSweepResponse(request);
}
