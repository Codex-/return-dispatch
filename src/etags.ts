import type {
  RequestHeaders,
  RequestParameters,
  OctokitResponse,
} from "@octokit/types";

interface EtagStoreEntry {
  etag: string;
  savedResponse: OctokitResponse<any>;
}

const etagStore = new Map<string, EtagStoreEntry>();

export async function withEtag<T, P extends RequestParameters>(
  endpoint: string,
  params: P,
  requester: (params: P) => Promise<OctokitResponse<T>>,
): Promise<OctokitResponse<T>> {
  const { etag, savedResponse } = getEtag(endpoint, params) ?? {};

  const paramsWithEtag = { ...params };
  if (etag)
    paramsWithEtag.headers = {
      "If-None-Match": etag,
      ...(params.headers ?? {}),
    } satisfies RequestHeaders;

  const response = await requester(paramsWithEtag);

  if (
    response.status === 304 &&
    etag &&
    etag === extractEtag(response) &&
    savedResponse !== undefined
  ) {
    return savedResponse;
  }

  rememberEtag(endpoint, params, response);
  return response;
}

function extractEtag(response: OctokitResponse<any>): string | undefined {
  if ("string" !== typeof response.headers.etag) return;
  return response.headers.etag.split('"')[1] ?? "";
}

function getEtag(endpoint: string, params: object): EtagStoreEntry | undefined {
  return etagStore.get(JSON.stringify({ endpoint, params }));
}

function rememberEtag(
  endpoint: string,
  params: object,
  response: OctokitResponse<any>,
): void {
  const etag = extractEtag(response);
  if (!etag) return;

  etagStore.set(JSON.stringify({ endpoint, params }), {
    etag,
    savedResponse: response,
  });
}

export function clearEtags(): void {
  etagStore.clear();
}
