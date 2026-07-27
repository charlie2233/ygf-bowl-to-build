export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface DemoRuntime {
  mode: "demo";
}

export interface SupabaseRuntime {
  mode: "supabase";
  publishableKey: string;
  serviceKey: string;
  url: string;
}

export type AuthRuntime = DemoRuntime | SupabaseRuntime;

function required(
  environment: RuntimeEnvironment,
  names: readonly string[],
) {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing required server configuration: ${names.join(" or ")}`);
}

export function resolveAuthRuntime(
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
): AuthRuntime {
  const demoMode = environment.YGF_DEMO_MODE === "true";

  if (demoMode) {
    if (nodeEnvironment === "production") {
      throw new Error("YGF demo mode is disabled in production");
    }
    return { mode: "demo" };
  }

  return {
    mode: "supabase",
    publishableKey: required(environment, [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]),
    serviceKey: required(environment, [
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]),
    url: required(environment, ["NEXT_PUBLIC_SUPABASE_URL"]),
  };
}

export function serverSecret(
  name:
    | "YGF_ABUSE_SIGNAL_SECRET"
    | "YGF_CLAIM_COOKIE_SECRET"
    | "YGF_TASK_FINGERPRINT_SECRET",
  environment: RuntimeEnvironment = process.env,
  nodeEnvironment = process.env.NODE_ENV,
) {
  const configured = environment[name];
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) {
    return configured;
  }

  if (
    nodeEnvironment !== "production" &&
    environment.YGF_DEMO_MODE === "true"
  ) {
    return `development-only-${name.toLowerCase()}-secret-32-bytes`;
  }

  throw new Error(`Missing or weak server configuration: ${name}`);
}
