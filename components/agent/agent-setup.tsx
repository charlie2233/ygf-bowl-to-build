"use client";

import {
  Check,
  Clipboard,
  KeyRound,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";

interface AgentKeyDescriptor {
  createdAt: string;
  expiresAt: string;
  id: string;
  last4: string;
  lastUsedAt: string | null;
  prefix: string;
  providerCommittedMicroUsd: number;
  remainingCredits: number;
  revokedAt: string | null;
}

interface RevealedKey {
  apiKey: string;
  key: AgentKeyDescriptor;
}

type ActionName =
  | "create"
  | "load"
  | "revoke"
  | "rotate"
  | "test"
  | null;

const KEY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PERSONAL_KEY_PATTERN = /^ygf_[A-Za-z0-9_-]{43}$/u;

function isKeyDescriptor(value: unknown): value is AgentKeyDescriptor {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }
  const key = value as Partial<AgentKeyDescriptor>;
  return (
    typeof key.id === "string" &&
    KEY_ID_PATTERN.test(key.id) &&
    typeof key.prefix === "string" &&
    key.prefix.length === 8 &&
    typeof key.last4 === "string" &&
    key.last4.length === 4 &&
    typeof key.createdAt === "string" &&
    Number.isFinite(new Date(key.createdAt).getTime()) &&
    typeof key.expiresAt === "string" &&
    Number.isFinite(new Date(key.expiresAt).getTime()) &&
    (key.lastUsedAt === null ||
      (typeof key.lastUsedAt === "string" &&
        Number.isFinite(new Date(key.lastUsedAt).getTime()))) &&
    (key.revokedAt === null ||
      (typeof key.revokedAt === "string" &&
        Number.isFinite(new Date(key.revokedAt).getTime()))) &&
    Number.isSafeInteger(key.remainingCredits) &&
    Number(key.remainingCredits) >= 0 &&
    Number.isSafeInteger(key.providerCommittedMicroUsd) &&
    Number(key.providerCommittedMicroUsd) >= 0
  );
}

function parseKeyList(value: unknown): AgentKeyDescriptor[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray((value as { keys?: unknown }).keys)
  ) {
    throw new Error("KEY_LIST_INVALID");
  }
  const keys = (value as { keys: unknown[] }).keys;
  if (!keys.every(isKeyDescriptor)) {
    throw new Error("KEY_LIST_INVALID");
  }
  return keys;
}

function parseRevealedKey(value: unknown): RevealedKey {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("KEY_RESPONSE_INVALID");
  }
  const candidate = value as {
    apiKey?: unknown;
    key?: unknown;
  };
  if (
    typeof candidate.apiKey !== "string" ||
    !PERSONAL_KEY_PATTERN.test(candidate.apiKey) ||
    !isKeyDescriptor(candidate.key)
  ) {
    throw new Error("KEY_RESPONSE_INVALID");
  }
  return {
    apiKey: candidate.apiKey,
    key: candidate.key,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatProviderSpend(microUsd: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 4,
    minimumFractionDigits: 4,
    style: "currency",
  }).format(microUsd / 1_000_000);
}

function keyLabel(key: AgentKeyDescriptor) {
  return `${key.prefix}••••••••${key.last4}`;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) {
    throw new Error("COPY_FAILED");
  }
}

async function fetchKeyList() {
  const response = await fetch("/api/keys", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("KEY_LIST_UNAVAILABLE");
  }
  return parseKeyList(await response.json());
}

function subscribeToBrowserOrigin() {
  return () => undefined;
}

function browserOriginSnapshot() {
  return window.location.origin;
}

export function AgentSetup({
  gatewayEnabled = true,
}: {
  configuredOrigin?: string;
  gatewayEnabled?: boolean;
}) {
  const [action, setAction] = useState<ActionName>("load");
  const browserOrigin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    browserOriginSnapshot,
    () => "",
  );
  const [keys, setKeys] = useState<AgentKeyDescriptor[]>([]);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [status, setStatus] = useState(
    "Loading your developer keys…",
  );
  const [statusTone, setStatusTone] = useState<
    "neutral" | "success" | "error"
  >("neutral");

  const displayBaseUrl = browserOrigin
    ? `${browserOrigin}/v1`
    : "This site’s /v1 endpoint";
  const activeKeys = keys.filter((key) => key.revokedAt === null);
  const currentKey = revealed?.apiKey ?? "";
  const snippets = useMemo(() => {
    const baseUrl = browserOrigin ? `${browserOrigin}/v1` : "";
    return {
      env: currentKey
        ? `OPENAI_BASE_URL=${baseUrl || "<this-site-origin>/v1"}\nOPENAI_API_KEY=${currentKey}`
        : "",
      json: currentKey
        ? JSON.stringify(
            {
              apiKey: currentKey,
              baseURL: baseUrl || "<this-site-origin>/v1",
              model: "fast",
            },
            null,
            2,
          )
        : "",
    };
  }, [browserOrigin, currentKey]);

  const loadKeys = useCallback(async (message = "") => {
    setAction("load");
    if (message) {
      setStatus(message);
      setStatusTone("neutral");
    }
    try {
      setKeys(await fetchKeyList());
      setStatus(message || "Your key list is up to date.");
      setStatusTone(message ? "neutral" : "success");
    } catch {
      setStatus(
        "We couldn’t load your keys. Your wallet and credits were not changed.",
      );
      setStatusTone("error");
    } finally {
      setAction(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetchKeyList()
      .then((loadedKeys) => {
        if (!mounted) {
          return;
        }
        setKeys(loadedKeys);
        setStatus("Your key list is up to date.");
        setStatusTone("success");
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setStatus(
          "We couldn’t load your keys. Your wallet and credits were not changed.",
        );
        setStatusTone("error");
      })
      .finally(() => {
        if (mounted) {
          setAction(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function createKey() {
    if (action || !gatewayEnabled) {
      return;
    }
    setAction("create");
    setRevealed(null);
    setStatus("Creating a personal, limited key…");
    setStatusTone("neutral");
    try {
      const response = await fetch("/api/keys", {
        body: "{}",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("KEY_CREATE_UNAVAILABLE");
      }
      const created = parseRevealedKey(await response.json());
      setRevealed(created);
      setKeys((current) => [
        created.key,
        ...current.filter((key) => key.id !== created.key.id),
      ]);
      setStatus(
        "Key created. Copy it now—the full secret appears only this time.",
      );
      setStatusTone("success");
    } catch {
      setStatus(
        "We couldn’t create a key. Your credits were not changed.",
      );
      setStatusTone("error");
    } finally {
      setAction(null);
    }
  }

  async function revokeKey(keyId: string) {
    if (action || !KEY_ID_PATTERN.test(keyId)) {
      return;
    }
    setAction("revoke");
    setStatus("Revoking the selected key…");
    setStatusTone("neutral");
    try {
      const response = await fetch(`/api/keys/${keyId}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("KEY_REVOKE_UNAVAILABLE");
      }
      setRevealed((current) =>
        current?.key.id === keyId ? null : current,
      );
      await loadKeys("Key revoked. It can no longer call the gateway.");
      setStatusTone("success");
    } catch {
      setStatus("We couldn’t revoke that key. Please try again.");
      setStatusTone("error");
      setAction(null);
    }
  }

  async function rotateKey(keyId: string) {
    if (action || !gatewayEnabled || !KEY_ID_PATTERN.test(keyId)) {
      return;
    }
    setAction("rotate");
    setRevealed(null);
    setStatus("Rotating the selected key…");
    setStatusTone("neutral");
    try {
      const response = await fetch(`/api/keys/${keyId}/rotate`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("KEY_ROTATE_UNAVAILABLE");
      }
      const replacement = parseRevealedKey(await response.json());
      setRevealed(replacement);
      await loadKeys(
        "Key rotated. The old key is revoked; copy the replacement now.",
      );
      setStatusTone("success");
    } catch {
      setStatus(
        "We couldn’t confirm rotation. Refresh your keys: the previous key may already be revoked, and a replacement secret cannot be recovered.",
      );
      setStatusTone("error");
      setAction(null);
    }
  }

  async function copyValue(label: string, value: string) {
    if (!value) {
      setStatus("Create or rotate a key first to reveal a copyable secret.");
      setStatusTone("error");
      return;
    }
    try {
      await copyText(value);
      setStatus(`${label} copied.`);
      setStatusTone("success");
    } catch {
      setStatus(`We couldn’t copy ${label.toLowerCase()}.`);
      setStatusTone("error");
    }
  }

  async function testConnection() {
    if (action || !gatewayEnabled || !revealed) {
      setStatus(
        "Create or rotate a key first. Previously shown secrets cannot be recovered.",
      );
      setStatusTone("error");
      return;
    }
    setAction("test");
    setStatus("Testing one small OpenAI-compatible request…");
    setStatusTone("neutral");
    try {
      const response = await fetch(
        "/v1/chat/completions",
        {
          body: JSON.stringify({
            max_tokens: 60,
            messages: [
              {
                content: "Return a short YGF connection check.",
                role: "user",
              },
            ],
            model: "fast",
            stream: false,
          }),
          cache: "no-store",
          credentials: "omit",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${revealed.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          method: "POST",
        },
      );
      const body = (await response.json()) as {
        ygf?: { remaining_credits?: unknown };
      };
      if (
        !response.ok ||
        !Number.isSafeInteger(body.ygf?.remaining_credits)
      ) {
        throw new Error("CONNECTION_TEST_FAILED");
      }
      const remaining = Number(body.ygf?.remaining_credits);
      setKeys((current) =>
        current.map((key) =>
          key.id === revealed.key.id
            ? { ...key, remainingCredits: remaining }
            : key,
        ),
      );
      setStatus(
        `Connection successful. ${remaining.toLocaleString("en-US")} credits remain.`,
      );
      setStatusTone("success");
    } catch {
      setStatus(
        "The connection test failed. No failed provider call should consume credits.",
      );
      setStatusTone("error");
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="agent-setup">
      <section
        aria-labelledby="agent-quick-start-title"
        className="agent-setup__quick-start"
      >
        <div>
          <p className="agent-setup__eyebrow">OpenAI-compatible</p>
          <h2 id="agent-quick-start-title">Connect in a few clicks</h2>
          <p>
            Your claim code stays separate. This page creates a personal,
            limited key for your own Agent.
          </p>
        </div>
        <ol aria-label="Agent connection steps">
          <li>
            <span>1</span>
            Create a key
          </li>
          <li>
            <span>2</span>
            Copy a config
          </li>
          <li>
            <span>3</span>
            Test the connection
          </li>
        </ol>
      </section>

      <section
        aria-labelledby="developer-api-key"
        className="agent-setup__developer"
      >
        <div className="agent-setup__section-heading">
          <div>
            <p className="agent-setup__eyebrow">Advanced</p>
            <h2 id="developer-api-key">Developer API key</h2>
            <p>
              Up to three active keys share the same wallet limit. Keys
              expire with your Build Credits.
            </p>
          </div>
          <Button
            disabled={!gatewayEnabled || action !== null || activeKeys.length >= 3}
            onClick={createKey}
          >
            <KeyRound aria-hidden="true" />
            {action === "create" ? "Creating…" : "Create personal key"}
          </Button>
        </div>

        {revealed ? (
          <div className="agent-secret" role="region" aria-label="New API key">
            <div>
              <ShieldCheck aria-hidden="true" />
              <p>
                <strong>Shown once</strong>
                <span>
                  Copy this secret now. We store only a keyed digest.
                </span>
              </p>
            </div>
            <code>{revealed.apiKey}</code>
            <Button
              onClick={() => copyValue("API key", revealed.apiKey)}
              variant="secondary"
            >
              <Clipboard aria-hidden="true" />
              Copy API key
            </Button>
          </div>
        ) : null}

        {!gatewayEnabled ? (
          <p className="agent-setup__status agent-setup__status--neutral">
            Phase A connection is not enabled for production yet. Existing
            keys can still be revoked.
          </p>
        ) : null}

        <div className="agent-config-grid">
          <article>
            <span>Base URL</span>
            <code>{displayBaseUrl}</code>
            <Button
              onClick={() =>
                copyValue(
                  "Base URL",
                  browserOrigin ? `${browserOrigin}/v1` : "",
                )
              }
              disabled={!browserOrigin}
              variant="secondary"
            >
              <Clipboard aria-hidden="true" />
              Copy Base URL
            </Button>
          </article>
          <article>
            <span>Environment file</span>
            <code>OPENAI_BASE_URL + OPENAI_API_KEY</code>
            <Button
              disabled={!currentKey}
              onClick={() => copyValue(".env config", snippets.env)}
              variant="secondary"
            >
              <Clipboard aria-hidden="true" />
              Copy .env
            </Button>
          </article>
          <article>
            <span>JSON config</span>
            <code>baseURL + apiKey + model</code>
            <Button
              disabled={!currentKey}
              onClick={() => copyValue("JSON config", snippets.json)}
              variant="secondary"
            >
              <Clipboard aria-hidden="true" />
              Copy JSON
            </Button>
          </article>
          <article>
            <span>Connection</span>
            <code>Allowlisted model · variable credits</code>
            <Button
              disabled={!gatewayEnabled || !currentKey || action !== null}
              onClick={testConnection}
              variant="secondary"
            >
              {action === "test" ? (
                <RefreshCw aria-hidden="true" />
              ) : (
                <PlugZap aria-hidden="true" />
              )}
              {action === "test" ? "Testing…" : "Test connection"}
            </Button>
            <small>
              Each chat request needs its own stable Idempotency-Key header;
              reuse it only when retrying that request.
            </small>
          </article>
        </div>

        <div
          aria-live="polite"
          className={`agent-setup__status agent-setup__status--${statusTone}`}
          role="status"
        >
          {statusTone === "success" ? <Check aria-hidden="true" /> : null}
          <span>{status}</span>
        </div>
      </section>

      <section
        aria-labelledby="agent-key-list-title"
        className="agent-setup__keys"
      >
        <div className="agent-setup__section-heading">
          <div>
            <p className="agent-setup__eyebrow">Your account</p>
            <h2 id="agent-key-list-title">Keys and usage</h2>
          </div>
          <Button
            disabled={action !== null}
            onClick={() => void loadKeys("Refreshing your keys…")}
            variant="quiet"
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {keys.length === 0 && action !== "load" ? (
          <p className="agent-setup__empty">
            No keys yet. Your normal Study, Coding, Career, and Pick My Bowl
            tools still work without one.
          </p>
        ) : (
          <ul className="agent-key-list">
            {keys.map((key) => {
              const active = key.revokedAt === null;
              return (
                <li key={key.id}>
                  <div>
                    <code>{keyLabel(key)}</code>
                    <span
                      className={
                        active
                          ? "agent-key-list__active"
                          : "agent-key-list__revoked"
                      }
                    >
                      {active ? "Active" : "Revoked"}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Credits remaining</dt>
                      <dd>
                        {key.remainingCredits.toLocaleString("en-US")}
                      </dd>
                    </div>
                    <div>
                      <dt>Estimated provider spend</dt>
                      <dd>
                        {formatProviderSpend(
                          key.providerCommittedMicroUsd,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>{formatDate(key.expiresAt)}</dd>
                    </div>
                    <div>
                      <dt>Last used</dt>
                      <dd>
                        {key.lastUsedAt
                          ? formatDate(key.lastUsedAt)
                          : "Not yet"}
                      </dd>
                    </div>
                  </dl>
                  {active ? (
                    <div className="agent-key-list__actions">
                      <Button
                        disabled={!gatewayEnabled || action !== null}
                        onClick={() => rotateKey(key.id)}
                        variant="secondary"
                      >
                        <RefreshCw aria-hidden="true" />
                        Rotate
                      </Button>
                      <Button
                        disabled={action !== null}
                        onClick={() => revokeKey(key.id)}
                        variant="quiet"
                      >
                        <Trash2 aria-hidden="true" />
                        Revoke
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="agent-security-note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Keep the key private</strong>
          <p>
            Never paste it into GitHub, a public chat, analytics, a URL, or
            frontend code. Revoke it immediately if it may have leaked.
          </p>
        </div>
      </aside>
    </div>
  );
}
