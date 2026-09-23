# Ghost

Ghost is a Chromium/Helium extension that gives each site a stable privacy profile. A site sees a consistent locale, language list, timezone, geolocation, platform, WebGL, and text-metric surface without telemetry. Its independent Global Privacy Control switch exposes `navigator.globalPrivacyControl` and sends `Sec-GPC: 1` on HTTP requests. Ghost does not use a remote service unless the optional automatic network-location feature is enabled.

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

## Helium compatibility

Ghost leaves AudioContext fingerprint protection and `navigator.hardwareConcurrency` entirely to Helium. For optional Helium flags, mirror the flags you enabled in Ghost's **Helium compatibility** settings; extensions cannot read `helium://flags` directly.

- Enable **Use Helium measureText noise** only with `helium://flags/#fingerprinting-canvas-measuretext-noise`; otherwise Ghost owns `CanvasRenderingContext2D.measureText` protection.
- Enable **Use Helium WebGL info spoofing** only with `helium://flags/#spoof-webgl-info`; Ghost and Helium must not both spoof the WebGL vendor/renderer.
- Enable **Use Helium UA reduction** with Helium's `reduced-system-info` or `remove-client-hints` flag; Ghost then leaves User-Agent, UA Client Hints, and platform surfaces unchanged. The Advanced build never stacks a separate CDP User-Agent override on either owner.

## Automatic network location

The opt-in **Match location to public IP** setting queries `https://my.ippure.com/v1/info` at startup and periodically while enabled. Ghost validates and caches only the returned timezone, country/region/city, and coordinates; it does not store the returned IP address. Network lookup and open-tab reapplication run outside the settings-page loading path. Use the refresh button beside **Detected location** to request an immediate update. The cached location overrides the selected profile's timezone and uses city-level geolocation accuracy while keeping its device identity and fingerprint seed stable.

Language behavior is independent: **Keep profile language** preserves the selected profile's locale and request language, while **Auto** derives `navigator.language`, `navigator.languages`, Intl locale, and `Accept-Language` from the detected VPN region. IP geolocation databases can disagree, so this improves consistency but cannot guarantee an exact match on every site.

Ghost only reports page-level fingerprint protection when its startup payload can be injected synchronously. Enable **Allow User Scripts** in the extension's details (Chrome 138+) or Developer mode on older supported Chromium. Without that authorization Ghost reports **Unprotected** and does not install the asynchronous page-world fallback, because a page could read the native fingerprint before its configured profile arrived. Reopen the popup after granting access to repair registration automatically.

## Scope

Ghost targets common JavaScript and request-header fingerprinting. It does not claim to hide IP address, DNS, TLS/JA3, HTTP/2, GPU process, browser-kernel, or manual visual signals. Font and emoji rendering cannot be fully replaced from a normal extension. Ghost partitions font exposure and, unless delegated to Helium, text-measurement outputs. It deliberately leaves Canvas pixel readback and serialization to the browser: post-processing those bytes in the extension creates a distinguishable artificial-noise signal.
