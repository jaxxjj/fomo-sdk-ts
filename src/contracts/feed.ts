import * as v from "./validation.js";
import { parseActivity, type Activity } from "./models.js";
import { parseComment, parseSegment, type ThesisComment, type CommentSegment } from "./comments.js";
export interface ThesisPage extends v.SourceObject {
  items: Activity[];
  hasNextPage: boolean;
  count?: number | null;
}
export interface FeedBody extends v.SourceObject {
  title?: string | null;
  description?: string | null;
  comment?: string | null;
  link?: string | null;
  ticker?: string | null;
  tokenAddress?: string | null;
  networkId?: number | null;
  userId?: string | null;
  marketCap?: v.DecimalString | null;
  price?: v.DecimalString | null;
  fdv?: v.DecimalString | null;
  humanTokenAmount?: v.DecimalString | null;
  positionNotionalUsd?: v.DecimalString | null;
  realizedPnlUsd?: v.DecimalString | null;
  unrealizedPnlUsd?: v.DecimalString | null;
  shortCommentSegments?: CommentSegment[] | null;
}
export interface FeedItem extends v.SourceObject {
  id: string;
  type: string;
  createdAt: string;
  body: FeedBody;
  userId?: string | null;
  tradeId?: string | null;
  tokenAddress?: string | null;
  networkId?: number | null;
  likes?: number | null;
  views?: number | null;
  numReplies?: number | null;
  verified?: boolean | null;
  pinned?: boolean | null;
  reacted?: boolean | null;
  tradeComment?: ThesisComment | null;
}
export interface FeedPage extends v.SourceObject {
  feed: FeedItem[];
}
function parseBody(value: unknown): FeedBody {
  const raw = v.object(value, "feed_body");
  return {
    ...raw,
    ...v.fields(
      raw,
      [
        "title",
        "description",
        "comment",
        "link",
        "anchorText",
        "tag",
        "ticker",
        "tokenAddress",
        "userId",
        "commentId",
        "userHandle",
        "displayName",
        "userImageUrl",
        "tokenImageUrl",
      ],
      v.optionalString,
    ),
    ...v.fields(raw, ["networkId"], v.optionalCount),
    ...v.fields(
      raw,
      [
        "marketCap",
        "price",
        "fdv",
        "humanTokenAmount",
        "positionNotionalUsd",
        "realizedPnlUsd",
        "unrealizedPnlUsd",
        "percentageRealizedPnl",
        "percentageUnrealizedPnl",
      ],
      v.decimal,
    ),
    ...v.fields(raw, ["shortCommentSegments"], (x) =>
      v.optional(x, (value) => v.list(value, "segments", parseSegment)),
    ),
  };
}
export function parseFeedItem(value: unknown): FeedItem {
  const raw = v.object(value, "feed_item");
  return {
    ...raw,
    id: v.string(raw.id, "feed_id"),
    type: v.string(raw.type, "feed_type"),
    createdAt: v.timestamp(raw.createdAt, "created_at"),
    body: parseBody(raw.body),
    ...v.fields(
      raw,
      ["userId", "tradeId", "swapId", "transferId", "tokenAddress"],
      v.optionalString,
    ),
    ...v.fields(raw, ["networkId", "likes", "views", "numReplies"], v.optionalCount),
    ...v.fields(raw, ["verified", "pinned", "reacted"], v.optionalBoolean),
    ...v.fields(raw, ["tradeComment"], (x) => v.optional(x, parseComment)),
  };
}
export function parseFeedPage(value: unknown): FeedPage {
  const raw = v.object(value, "feed_page");
  return { ...raw, feed: v.list(raw.feed, "feed", parseFeedItem) };
}
export function parseThesisPage(value: unknown): ThesisPage {
  const raw = v.object(value, "thesis_page");
  return {
    ...raw,
    items: v.list(raw.items, "theses", parseActivity),
    hasNextPage: v.boolean(raw.hasNextPage, "has_next_page"),
    ...v.fields(raw, ["count"], v.optionalCount),
  };
}
