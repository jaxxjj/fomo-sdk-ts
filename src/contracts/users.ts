import * as v from "./validation.js";
const TEXT = [
  "address",
  "evmAddress",
  "displayName",
  "profilePictureLink",
  "description",
  "thumbhash",
  "coverPhotoLink",
  "coverPhotoThumbhash",
  "twitter",
] as const;
const COUNTS = ["followers", "following", "swapCount", "numTrades", "numFriendsFollowing"] as const;
const MONEY = [
  "totalVolume",
  "totalPnL",
  "equity",
  "pnl24h",
  "pnl7d",
  "pnl30d",
  "averageHoldTimeSeconds",
] as const;
const FLAGS = [
  "activated",
  "verified",
  "isReferred",
  "isRestricted",
  "private",
  "followsCurrentUser",
] as const;
export interface ClanIdentity extends v.SourceObject {
  id: string;
  name?: string | null;
  iconLink?: string | null;
  iconThumbhash?: string | null;
}
export type User = v.SourceObject & {
  id: string;
  userHandle: string;
  createdAt?: string | null;
  clan?: ClanIdentity | null;
  referralUser?: User | null;
  friendsFollowing?: User[] | null;
} & Partial<Record<(typeof TEXT)[number], string | null>> &
  Partial<Record<(typeof COUNTS)[number], number | null>> &
  Partial<Record<(typeof MONEY)[number], v.DecimalString | null>> &
  Partial<Record<(typeof FLAGS)[number], boolean | null>>;
export interface RecommendedUsers extends v.SourceObject {
  following: User[];
  topTraders: User[];
}
export function parseClanIdentity(value: unknown): ClanIdentity {
  const raw = v.object(value, "clan_identity");
  return {
    ...raw,
    id: v.string(raw.id, "clan_id"),
    ...v.fields(raw, ["name", "iconLink", "iconThumbhash"], v.optionalString),
  };
}
export function parseUser(value: unknown): User {
  const raw = v.object(value, "user");
  return {
    ...raw,
    id: v.string(raw.id, "user_id"),
    userHandle: v.string(raw.userHandle, "user_handle"),
    ...v.fields(raw, TEXT, v.optionalString),
    ...v.fields(raw, COUNTS, v.optionalCount),
    ...v.fields(raw, MONEY, v.decimal),
    ...v.fields(raw, FLAGS, v.optionalBoolean),
    ...v.fields(raw, ["createdAt"], v.optionalTimestamp),
    ...v.fields(raw, ["clan"], (x) => v.optional(x, parseClanIdentity)),
    ...v.fields(raw, ["referralUser"], (x) => v.optional(x, parseUser)),
    ...v.fields(raw, ["friendsFollowing"], (x) =>
      v.optional(x, (value) => v.list(value, "friends_following", parseUser)),
    ),
  };
}
export function parseRecommended(value: unknown): RecommendedUsers {
  const raw = v.object(value, "recommended");
  return {
    ...raw,
    following: v.list(raw.following, "following", parseUser),
    topTraders: v.list(raw.topTraders, "top_traders", parseUser),
  };
}
