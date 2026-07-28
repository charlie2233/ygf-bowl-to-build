import { resolveAuthRuntime } from "@/lib/auth/runtime";
import {
  MemoryCampaignRepository,
} from "@/lib/repositories/memory-campaign-repository";
import {
  SupabaseCampaignRepository,
  type Task4CampaignRepository,
} from "@/lib/repositories/supabase-campaign-repository";

const globalRepositories = globalThis as typeof globalThis & {
  ygfDemoRepository?: MemoryCampaignRepository;
};

export function getDemoCampaignRepository(): MemoryCampaignRepository {
  globalRepositories.ygfDemoRepository ??=
    new MemoryCampaignRepository({ demoMode: true });
  return globalRepositories.ygfDemoRepository;
}

export function getCampaignRepository(): Task4CampaignRepository {
  const runtime = resolveAuthRuntime();
  if (runtime.mode === "supabase") {
    return new SupabaseCampaignRepository();
  }

  return getDemoCampaignRepository();
}

export function resetDemoRepositoryForTests() {
  delete globalRepositories.ygfDemoRepository;
}
