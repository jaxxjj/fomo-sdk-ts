import { FomoClient, StaticSession } from "../dist/index.js";
export const envelope = (data) => ({
  success: true,
  statusCode: 200,
  message: "ok",
  responseObject: data,
});
export function response(data, status = 200, headers = {}) {
  return new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers });
}
export function client(reply, options = {}) {
  const calls = [];
  const transport = {
    async send(request) {
      calls.push(request);
      return reply(request, calls.length);
    },
  };
  return {
    calls,
    client: new FomoClient({
      session: new StaticSession({ accessToken: "synthetic-token" }),
      transport,
      maxRetries: 0,
      ...options,
    }),
  };
}
export const user = (id = "self") => ({
  id,
  userHandle: "synthetic-user",
  followers: 3,
  following: 1,
  totalVolume: 0,
});
export const swap = (id) => ({
  id,
  createdAt: "2026-09-08T00:00:00Z",
  networkId: 56,
  inAmount: 123,
  outAmount: 456,
});
export const activity = (id, type = "swap_buy") => ({
  id,
  type,
  userId: "synthetic-user",
  createdAt: "2026-09-08T00:00:00Z",
  networkId: 56,
  tokenAddress: "synthetic-token",
});
export function jwt(exp) {
  return `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.synthetic`;
}
