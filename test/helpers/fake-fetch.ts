import type { FetchLike } from '../../src/shared/fetch.js';

export function fakeFetch(handler: (req: Request) => Response | Promise<Response>): {
  fetch: FetchLike;
  calls: Request[];
} {
  const calls: Request[] = [];
  const fetch: FetchLike = async (input, init) => {
    const req = new Request(input, init);
    calls.push(req);
    return handler(req);
  };
  return { fetch, calls };
}
