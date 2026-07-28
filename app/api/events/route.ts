export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  expires: "0",
  pragma: "no-cache",
};

/**
 * Retired legacy partner handoff. It performs no authentication lookup,
 * analytics mutation, or external redirect.
 */
export function createPartnerHandoffSignalHandler() {
  return async function handle(request: Request): Promise<Response> {
    void request;
    return Response.json(
      {
        error: "ENDPOINT_RETIRED",
        next: "/connect/agent",
      },
      {
        headers: PRIVATE_HEADERS,
        status: 410,
      },
    );
  };
}

export async function POST(request: Request) {
  return createPartnerHandoffSignalHandler()(request);
}
