import { FomoError } from "../errors.js";

/** A single-consumer queue. Overflow is a visible terminal error, never silent loss. */
export class BoundedQueue<T> {
  #items: T[] = [];
  #waiting?: { resolve: (result: IteratorResult<T>) => void; reject: (error: unknown) => void };
  #ended = false;
  #error?: unknown;
  constructor(private readonly capacity: number) {}
  push(value: T): void {
    if (this.#ended || this.#error) return;
    if (this.#waiting) {
      const waiting = this.#waiting;
      this.#waiting = undefined;
      waiting.resolve({ done: false, value });
      return;
    }
    if (this.#items.length >= this.capacity)
      throw new FomoError("backpressure", { reason: "stream_queue_overflow" });
    this.#items.push(value);
  }
  next(): Promise<IteratorResult<T>> {
    if (this.#error) return Promise.reject(this.#error);
    if (this.#items.length) return Promise.resolve({ done: false, value: this.#items.shift()! });
    if (this.#ended) return Promise.resolve({ done: true, value: undefined });
    if (this.#waiting)
      return Promise.reject(
        new FomoError("configuration", { reason: "concurrent_stream_consumer" }),
      );
    return new Promise((resolve, reject) => {
      this.#waiting = { resolve, reject };
    });
  }
  end(): void {
    this.#ended = true;
    this.#waiting?.resolve({ done: true, value: undefined });
    this.#waiting = undefined;
  }
  fail(error: unknown): void {
    if (this.#error) return;
    this.#error = error;
    this.#items = [];
    this.#waiting?.reject(error);
    this.#waiting = undefined;
  }
}
