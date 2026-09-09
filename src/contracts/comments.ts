import * as v from "./validation.js";
export interface CommentSegment extends v.SourceObject {
  text: string;
  link?: string | null;
  provider?: string | null;
}
export interface CommentReactions extends v.SourceObject {
  counts?: (v.SourceObject & { likeCount?: number | null }) | null;
  reactions?: (v.SourceObject & { like?: boolean | null }) | null;
}
export interface ThesisComment extends v.SourceObject {
  comment: string;
  id?: string | null;
  userId?: string | null;
  tradeId?: string | null;
  parentId?: string | null;
  createdAt?: string | null;
  tokenAddress?: string | null;
  networkId?: number | null;
  numLikes?: number | null;
  olderThesis?: number | null;
  newerThesis?: number | null;
  commentSegments?: CommentSegment[] | null;
  shortCommentSegments?: CommentSegment[] | null;
  reactions?: CommentReactions | null;
}
export interface CommentPage extends v.SourceObject {
  comments: ThesisComment[];
  hasNextPage: boolean;
}
export function parseSegment(value: unknown): CommentSegment {
  const raw = v.object(value, "comment_segment");
  if (typeof raw.text !== "string") return v.malformed("segment_text");
  return { ...raw, text: raw.text, ...v.fields(raw, ["link", "provider"], v.optionalString) };
}
function parseReactions(value: unknown): CommentReactions {
  const raw = v.object(value, "reactions");
  return {
    ...raw,
    ...v.fields(raw, ["counts"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value);
        return { ...r, ...v.fields(r, ["likeCount"], v.optionalCount) };
      }),
    ),
    ...v.fields(raw, ["reactions"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value);
        return { ...r, ...v.fields(r, ["like"], v.optionalBoolean) };
      }),
    ),
  };
}
export function parseComment(value: unknown): ThesisComment {
  const raw = v.object(value, "thesis_comment");
  if (typeof raw.comment !== "string") return v.malformed("thesis_text");
  return {
    ...raw,
    comment: raw.comment,
    ...v.fields(raw, ["id", "userId", "tradeId", "parentId", "tokenAddress"], v.optionalString),
    ...v.fields(raw, ["createdAt"], v.optionalTimestamp),
    ...v.fields(raw, ["networkId", "numLikes", "olderThesis", "newerThesis"], v.optionalCount),
    ...v.fields(raw, ["commentSegments", "shortCommentSegments"], (x, key) =>
      v.optional(x, (value) => v.list(value, key, parseSegment)),
    ),
    ...v.fields(raw, ["reactions"], (x) => v.optional(x, parseReactions)),
  };
}
export function parseCommentPage(value: unknown): CommentPage {
  const raw = v.object(value, "comment_page");
  return {
    ...raw,
    comments: v.list(raw.comments, "comments", parseComment),
    hasNextPage: v.boolean(raw.hasNextPage, "has_next_page"),
  };
}
