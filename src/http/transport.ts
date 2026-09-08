export interface HttpRequest {
  url: string;
  method: "GET";
  headers: Readonly<Record<string, string>>;
  signal: AbortSignal;
}
export interface HttpResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}
export interface HttpTransport {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/** Plain fetch is explicit: service acceptance is not guaranteed. */
export function createFetchTransport(fetcher: typeof fetch = fetch): HttpTransport {
  return {
    send: (request) =>
      fetcher(request.url, {
        method: request.method,
        headers: { ...request.headers },
        signal: request.signal,
        redirect: "error",
      }),
  };
}

/** Lazily loads the native dependency. No browser process or credential discovery. */
export function createImpitTransport(): HttpTransport {
  let instance: Promise<import("impit").Impit> | undefined;
  return {
    async send(request) {
      instance ??= import("impit").then(
        ({ Impit }) => new Impit({ browser: "chrome", http3: false, timeout: 12000 }),
      );
      const client = await instance;
      return client.fetch(request.url, {
        method: request.method,
        headers: { ...request.headers },
        signal: request.signal,
        redirect: "error",
      });
    },
  };
}
