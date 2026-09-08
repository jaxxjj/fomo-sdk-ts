import { type RequestOptions, FomoConnection } from "../connection.js";
import { type Page, type Swap, parseSwap } from "../contracts/models.js";
import { object, array, boolean, identifier } from "../contracts/validation.js";
import { integer } from "../internal/async.js";
import { FomoError } from "../errors.js";
export interface SwapListParams {
  userId: string;
  cursor?: string;
}
export interface PageOptions extends RequestOptions {
  maxPages?: number;
  maxItems?: number;
}
export class SwapsResource {
  constructor(private readonly connection: FomoConnection) {}
  async list(params: SwapListParams, options: RequestOptions = {}): Promise<Page<Swap>> {
    const id = identifier(params.userId, "user_id");
    const result = await this.connection.request(
      "swaps.list",
      `/v2/users/${encodeURIComponent(id)}/swaps`,
      {
        lastSwapIdV2: params.cursor === undefined ? undefined : identifier(params.cursor, "cursor"),
      },
      options,
    );
    const body = object(result.data, "swaps_page");
    const data = array(body.swaps, "swaps").map(parseSwap);
    const hasNextPage = boolean(body.hasNextPage, "has_next_page");
    if (hasNextPage && !data.length)
      throw new FomoError("pagination", {
        reason: "empty_nonterminal_page",
        operation: "swaps.list",
      });
    return {
      ...result,
      data,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage ? data.at(-1)?.id : undefined,
        sourceCount: data.length,
      },
    };
  }
  async *pages(params: SwapListParams, options: PageOptions = {}): AsyncGenerator<Page<Swap>> {
    const maxPages = integer(options.maxPages ?? 20, 1, 1000, "max_pages");
    const maxItems = integer(options.maxItems ?? 1000, 1, 100000, "max_items");
    const seen = new Set<string>();
    let cursor = params.cursor;
    if (cursor) seen.add(cursor);
    let remaining = maxItems;
    for (let index = 0; index < maxPages; index++) {
      const page = await this.list({ ...params, cursor }, options);
      const next = page.pageInfo.nextCursor;
      if (page.pageInfo.hasNextPage && (!next || seen.has(next)))
        throw new FomoError("pagination", { reason: "repeated_cursor", operation: "swaps.pages" });
      const clipped = page.data.length > remaining;
      const data = clipped ? page.data.slice(0, remaining) : page.data;
      remaining -= data.length;
      const more = clipped || page.pageInfo.hasNextPage;
      const stopReason = !more
        ? "end"
        : remaining === 0
          ? "max_items"
          : index + 1 === maxPages
            ? "max_pages"
            : undefined;
      yield {
        ...page,
        data,
        pageInfo: {
          ...page.pageInfo,
          hasNextPage: more,
          nextCursor: more ? data.at(-1)?.id : undefined,
          stopReason,
        },
      };
      if (stopReason) return;
      cursor = next;
      seen.add(next!);
    }
  }
}
