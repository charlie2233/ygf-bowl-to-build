import { createAdminBatchActivationHandler } from "@/lib/admin/batch-activation-handler";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return createAdminBatchActivationHandler()(
    request,
    await params,
  );
}
