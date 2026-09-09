import * as v from "./validation.js";
import { parseUser, type User } from "./users.js";
const LINKS = [
  "iconLink",
  "iconThumbhash",
  "description",
  "website",
  "xLink",
  "telegramLink",
  "discordLink",
  "coverPhotoLink",
  "coverPhotoThumbhash",
] as const;
export interface ClanMember extends v.SourceObject {
  user: User;
  pnl?: v.DecimalString | null;
  role?: string | null;
  humanAmount?: v.DecimalString | null;
  value?: v.DecimalString | null;
  percentagePnl?: v.DecimalString | null;
}
export interface ClanToken extends v.SourceObject {
  tokenAddress: string;
  networkId: number;
  symbol?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  imageThumbhash?: string | null;
  pnl?: v.DecimalString | null;
  humanAmount?: v.DecimalString | null;
  value?: v.DecimalString | null;
  percentagePnl?: v.DecimalString | null;
  memberCount?: number | null;
  topMembers?: User[] | null;
}
export type Clan = v.SourceObject &
  Partial<Record<(typeof LINKS)[number], string | null>> & {
    id: string;
    name: string;
    createdAt?: string | null;
    rank?: number | null;
    pnl?: v.DecimalString | null;
    memberCount?: number | null;
    tradeCount?: number | null;
    topMembers?: ClanMember[] | null;
    members?: ClanMember[] | null;
    topTokens?: ClanToken[] | null;
    viewerRole?: string | null;
    viewerHasPendingInvite?: boolean | null;
  };
export interface ClanHoldings extends v.SourceObject {
  holdings: ClanToken[];
  totalCount: number;
  hasNextPage: boolean;
}
export function parseClanMember(value: unknown): ClanMember {
  const raw = v.object(value, "clan_member");
  return {
    ...raw,
    user: parseUser(raw.user),
    ...v.fields(raw, ["pnl", "humanAmount", "value", "percentagePnl"], v.decimal),
    ...v.fields(raw, ["role"], v.optionalString),
  };
}
export function parseClanToken(value: unknown): ClanToken {
  const raw = v.object(value, "clan_token");
  return {
    ...raw,
    tokenAddress: v.string(raw.tokenAddress, "token_address"),
    networkId: v.count(raw.networkId, "network_id"),
    ...v.fields(raw, ["symbol", "name", "imageUrl", "imageThumbhash"], v.optionalString),
    ...v.fields(raw, ["pnl", "humanAmount", "value", "percentagePnl"], v.decimal),
    ...v.fields(raw, ["memberCount"], v.optionalCount),
    ...v.fields(raw, ["topMembers"], (x) =>
      v.optional(x, (value) => v.list(value, "top_members", parseUser)),
    ),
  };
}
export function parseClan(value: unknown): Clan {
  const raw = v.object(value, "clan");
  return {
    ...raw,
    id: v.string(raw.id, "clan_id"),
    name: v.string(raw.name, "clan_name"),
    ...v.fields(raw, LINKS, v.optionalString),
    ...v.fields(raw, ["createdAt"], v.optionalTimestamp),
    ...v.fields(raw, ["rank", "memberCount", "tradeCount"], v.optionalCount),
    ...v.fields(raw, ["pnl"], v.decimal),
    ...v.fields(raw, ["viewerRole"], v.optionalString),
    ...v.fields(raw, ["viewerHasPendingInvite"], v.optionalBoolean),
    ...v.fields(raw, ["topMembers", "members"], (x, key) =>
      v.optional(x, (value) => v.list(value, key, parseClanMember)),
    ),
    ...v.fields(raw, ["topTokens"], (x) =>
      v.optional(x, (value) => v.list(value, "top_tokens", parseClanToken)),
    ),
  };
}
export function parseClanHoldings(value: unknown): ClanHoldings {
  const raw = v.object(value, "clan_holdings");
  return {
    ...raw,
    holdings: v.list(raw.holdings, "holdings", parseClanToken),
    totalCount: v.count(raw.totalCount, "total_count"),
    hasNextPage: v.boolean(raw.hasNextPage, "has_next_page"),
  };
}
