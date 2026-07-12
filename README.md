# Ghost

Ghost is a Chromium/Helium extension that gives each site a stable privacy profile. A site sees a consistent locale, language list, timezone, geolocation, platform, WebGL, and canvas/audio fingerprint surface without sending telemetry or using a remote service. Its independent Global Privacy Control switch exposes `navigator.globalPrivacyControl` and sends `Sec-GPC: 1` on HTTP requests.

## Builds

- `lite`: no `debugger` permission. Uses early page-world JavaScript patches plus persistent and tab-scoped Declarative Net Request rules for headers.
- `advanced`: includes the `debugger` permission and attempts Chrome DevTools Protocol environment overrides. If attach fails, it falls back to the lite behavior.

Chromium does not allow the `debugger` permission to be optional, so the two builds are separate.

## Commands

```bash
npm install
npm run build:lite
npm run build:advanced
npm run verify
```

Load `dist/lite` or `dist/advanced` as an unpacked extension in Chromium/Helium.

For protection to be installed before page scripts run, enable **Allow User Scripts** in the extension's details (Chrome 138+) or Developer mode on older supported Chromium. This is optional: without it Ghost uses an automatic asynchronous fallback, although a page's earliest reads may occur before the configured profile is available. Reopening the popup after granting access repairs registration automatically.

## Scope

Ghost targets common JavaScript and request-header fingerprinting. It does not claim to hide IP address, DNS, TLS/JA3, HTTP/2, GPU process, browser-kernel, or manual visual signals. Font and emoji rendering cannot be fully replaced from a normal extension; Ghost stabilizes JavaScript-visible canvas and text-measurement outputs instead.

## TODO
* 预期在0.2.0前实现完整的DNS保护
