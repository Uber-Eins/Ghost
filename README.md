# Ghost

Ghost is a Chromium/Helium extension that gives each site a stable privacy profile. A site sees a consistent locale, language list, timezone, geolocation, platform, WebGL, text-metric, and audio fingerprint surface without sending telemetry or using a remote service. Its independent Global Privacy Control switch exposes `navigator.globalPrivacyControl` and sends `Sec-GPC: 1` on HTTP requests.

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

Ghost only reports page-level fingerprint protection when its startup payload can be injected synchronously. Enable **Allow User Scripts** in the extension's details (Chrome 138+) or Developer mode on older supported Chromium. Without that authorization Ghost reports **Unprotected** and does not install the asynchronous page-world fallback, because a page could read the native fingerprint before its configured profile arrived. Reopen the popup after granting access to repair registration automatically.

## Scope

Ghost targets common JavaScript and request-header fingerprinting. It does not claim to hide IP address, DNS, TLS/JA3, HTTP/2, GPU process, browser-kernel, or manual visual signals. Font and emoji rendering cannot be fully replaced from a normal extension. Ghost partitions font exposure and text-measurement outputs, but deliberately leaves Canvas pixel readback and serialization native: post-processing those bytes creates a distinguishable artificial-noise signal, so the native raster fingerprint can remain linkable across sites.

## TODO
* 预期在0.2.0前实现完整的DNS保护
