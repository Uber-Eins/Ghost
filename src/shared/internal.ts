const SUPPORTED_PAGE_PROTOCOLS = new Set(["http:", "https:", "file:"]);

export function isSupportedPageUrl(url: string): boolean {
  try {
    return SUPPORTED_PAGE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function isAccessiblePageUrl(url: string, fileSchemeAccessAllowed: boolean): boolean {
  if (!isSupportedPageUrl(url)) {
    return false;
  }
  try {
    return new URL(url).protocol !== "file:" || fileSchemeAccessAllowed;
  } catch {
    return false;
  }
}

export function senderBoundPageUrl(
  requestedUrl: string,
  senderUrl: string,
  senderOrigin?: string,
  topLevelUrl?: string
): string {
  if (isSupportedPageUrl(senderUrl)) {
    if (isSupportedPageUrl(requestedUrl) && sameNonOpaqueOrigin(senderUrl, requestedUrl)) {
      return requestedUrl;
    }
    return senderUrl;
  }
  if (
    isSupportedPageUrl(requestedUrl)
    && isRelatedFrameUrl(senderUrl)
    && (
      (senderOrigin ? sameNonOpaqueOrigin(senderOrigin, requestedUrl) : false)
      || (topLevelUrl ? sameNonOpaqueOrigin(topLevelUrl, requestedUrl) : false)
      || requestedUrl === topLevelUrl
    )
  ) {
    return requestedUrl;
  }
  return "";
}

function sameNonOpaqueOrigin(left: string, right: string): boolean {
  try {
    const leftOrigin = new URL(left).origin;
    const rightOrigin = new URL(right).origin;
    return leftOrigin !== "null" && leftOrigin === rightOrigin;
  } catch {
    return false;
  }
}

function isRelatedFrameUrl(url: string): boolean {
  return /^(?:about:|blob:|data:)/.test(url);
}

export function unsupportedPageLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//`;
  } catch {
    return "unsupported";
  }
}
