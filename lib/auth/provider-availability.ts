export interface OAuthProviderAvailability {
  apple: boolean;
  google: boolean;
}

export const NO_OAUTH_PROVIDERS: OAuthProviderAvailability = Object.freeze({
  apple: false,
  google: false,
});

type PublicAuthSettingsRuntime = Readonly<{
  publishableKey: string;
  url: string;
}>;

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function parseOAuthProviderAvailability(
  settings: unknown,
): OAuthProviderAvailability {
  if (
    typeof settings !== "object" ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return { ...NO_OAUTH_PROVIDERS };
  }

  const external = (settings as Record<string, unknown>).external;
  if (
    typeof external !== "object" ||
    external === null ||
    Array.isArray(external)
  ) {
    return { ...NO_OAUTH_PROVIDERS };
  }

  const providers = external as Record<string, unknown>;
  return {
    apple: providers.apple === true,
    google: providers.google === true,
  };
}

export async function getOAuthProviderAvailability(
  runtime: PublicAuthSettingsRuntime,
  fetchImplementation: FetchImplementation = fetch,
): Promise<OAuthProviderAvailability> {
  try {
    const baseUrl = runtime.url.endsWith("/")
      ? runtime.url
      : `${runtime.url}/`;
    const settingsUrl = new URL("auth/v1/settings", baseUrl);
    const response = await fetchImplementation(settingsUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        apikey: runtime.publishableKey,
      },
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      return { ...NO_OAUTH_PROVIDERS };
    }

    return parseOAuthProviderAvailability(await response.json());
  } catch {
    return { ...NO_OAUTH_PROVIDERS };
  }
}
