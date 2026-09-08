import { FomoError } from "../errors.js";

export function integer(value: number, min: number, max: number, reason: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new FomoError("configuration", { reason });
  }
  return value;
}

export function abortError(): FomoError {
  return new FomoError("aborted");
}

/** Detaches only this waiter. It does not cancel a shared underlying refresh. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const done = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export function deadline(timeoutMs: number, caller?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: caller ? AbortSignal.any([controller.signal, caller]) : controller.signal,
    timedOut: () => controller.signal.aborted && !caller?.aborted,
    dispose: () => clearTimeout(timer),
  };
}
