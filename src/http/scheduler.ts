import { FomoError } from "../errors.js";
import { integer } from "../internal/async.js";

interface Waiter {
  signal: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (error: FomoError) => void;
  abort: () => void;
}
export class Scheduler {
  #active = 0;
  #waiting: Waiter[] = [];
  readonly #limit: number;
  readonly #queue: number;
  constructor(limit: number, queue: number) {
    this.#limit = integer(limit, 1, 32, "concurrency");
    this.#queue = integer(queue, 0, 10000, "queue_size");
  }
  #release(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active--;
      const next = this.#waiting.shift();
      if (next) {
        next.signal.removeEventListener("abort", next.abort);
        this.#active++;
        next.resolve(this.#release());
      }
    };
  }
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new FomoError("aborted"));
    if (this.#active < this.#limit) {
      this.#active++;
      return Promise.resolve(this.#release());
    }
    if (this.#waiting.length >= this.#queue) return Promise.reject(new FomoError("queue_full"));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        resolve,
        reject,
        abort: () => {
          const at = this.#waiting.indexOf(waiter);
          if (at >= 0) this.#waiting.splice(at, 1);
          signal.removeEventListener("abort", waiter.abort);
          reject(new FomoError("aborted"));
        },
      };
      this.#waiting.push(waiter);
      signal.addEventListener("abort", waiter.abort, { once: true });
    });
  }
}
