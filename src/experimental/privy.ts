import {
  RefreshableSession,
  type RefreshableSessionOptions,
  type SessionRefresher,
} from "../auth/session.js";
import { FomoError } from "../errors.js";
import { readText } from "../http/response.js";
import { object } from "../contracts/validation.js";
import { parse } from "lossless-json";

export interface PrivyRefresherOptions {
  fetch?: typeof fetch;
  /** Public application identifiers from the investigated Fomo integration. */
  appId?: string;
  clientId?: string;
  clientVersion?: string;
}
function header(value: string): string {
  if (typeof value !== "string" || !value || /[\r\n]/.test(value))
    throw new FomoError("configuration", { reason: "privy_header" });
  return value;
}
/** Experimental: ignore was live-observed; true expiry/rotation remains unqualified. */
export function createPrivyRefresher(options: PrivyRefresherOptions = {}): SessionRefresher {
  const fetcher = options.fetch ?? fetch;
  const application = {
    "privy-app-id": header(options.appId ?? "cm6h485o300n3zj9yl6vpedq7"),
    "privy-client-id": header(
      options.clientId ?? "client-WY5gFSayQjxnQhG4rP6SnwPAyPZWZpNRhJ6b9rzMnYwqH",
    ),
    "privy-client": header(options.clientVersion ?? "react-auth:3.34.0"),
  };
  return async (current, { signal }) => {
    if (!current.refreshToken || !current.privyAccessToken || !current.clientAuthId) {
      throw new FomoError("authentication", { reason: "refresh_credentials_required" });
    }
    let response: Response;
    try {
      response = await fetcher("https://auth.privy.io/api/v1/sessions", {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          ...application,
          authorization: `Bearer ${header(current.privyAccessToken)}`,
          "privy-ca-id": header(current.clientAuthId),
          "content-type": "application/json",
          origin: "https://fomo.family",
        },
        body: JSON.stringify({ refresh_token: current.refreshToken }),
      });
    } catch {
      if (signal.aborted) throw new FomoError("aborted");
      throw new FomoError("network", { reason: "privy_transport" });
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new FomoError("authentication", {
        status: response.status,
        reason: "refresh_rejected",
      });
    }
    const text = await readText(response, 256 * 1024, signal);
    let decoded: unknown;
    try {
      // Credential fields must be JSON strings on the wire. The financial
      // decoder intentionally converts numbers to strings and is unsafe here.
      decoded = parse(text, undefined, {
        onDuplicateKey: () => {
          throw new Error();
        },
      });
    } catch {
      throw new FomoError("protocol", { reason: "invalid_json" });
    }
    const value = object(decoded, "refresh_response");
    if (value.session_update_action === "ignore") return { action: "ignore" };
    if (value.session_update_action === "clear") return { action: "clear" };
    if (value.session_update_action !== "set" || typeof value.token !== "string" || !value.token) {
      throw new FomoError("protocol", { reason: "unknown_refresh_response" });
    }
    const optional = (key: string, previous: string | undefined) => {
      const valueAtKey = value[key];
      if (valueAtKey == null) return previous;
      if (typeof valueAtKey !== "string" || !valueAtKey)
        throw new FomoError("protocol", { reason: "invalid_rotated_credential" });
      return valueAtKey;
    };
    return {
      action: "set",
      credentials: {
        accessToken: value.token, // Derive NEW JWT expiry; do not retain the old explicit expiresAt.
        refreshToken: optional("refresh_token", current.refreshToken),
        privyAccessToken: optional("privy_access_token", current.privyAccessToken),
        clientAuthId: current.clientAuthId,
      },
    };
  };
}
export function createPrivySession(
  options: Omit<RefreshableSessionOptions, "refresh"> & { privy?: PrivyRefresherOptions },
): RefreshableSession {
  return new RefreshableSession({ ...options, refresh: createPrivyRefresher(options.privy) });
}
