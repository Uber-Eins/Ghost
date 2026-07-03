const SUPPORTED_PAGE_PROTOCOLS = new Set(["http:", "https:", "file:"]);

export function isSupportedPageUrl(url: string): boolean {
  try {
    return SUPPORTED_PAGE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function unsupportedPageLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//`;
  } catch {
    return "unsupported";
  }
}
