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

## Saving and startup

A successful save means settings have been stored and extension-global protection (the early page bootstrap and persistent request-header rules) has been applied. Updating already-open tabs is dispatched separately: a slow CDP target or nonresponding content-script message does not hold the save reply or popup loading. A global application failure still rejects the save and restores the previous settings/runtime configuration.

Tab updates retain ordering and skip obsolete queued revisions. Page profile replies do not wait for CDP and do not claim that a pending Advanced override has completed. Existing tabs can finish applying after the save acknowledgement; a permanently unresponsive target can still delay its own CDP work, but not the control panel or other settings commits.

Each new service-worker instance reconciles persisted global configuration, including ordinary wake-ups without an `onStartup` event. The popup/options initial load waits only for this global transaction, not all tabs. This prevents a fresh UI context from racing the worker's initial user-script registration. Saving no longer re-registers a second, potentially outdated bootstrap payload from the options UI.

## Helium compatibility

Ghost leaves AudioContext fingerprint protection and `navigator.hardwareConcurrency` entirely to Helium. Extensions cannot read `helium://flags` directly, and Helium deliberately identifies itself as Google Chrome, so Ghost does not try to detect the browser. Instead, the **Browser environment** card in the Helium compatibility settings probes the observable effects of each flag from Ghost's own pages: the fixed vendor/renderer pairs returned by `spoof-webgl-info`, empty `navigator.userAgentData` brands from `remove-client-hints`, empty high-entropy client hints from `reduced-system-info`, and per-document `measureText` scaling from `fingerprinting-canvas-measuretext-noise`. With **Set these switches from detected flags** enabled (the default for fresh installs), Ghost re-checks at startup and whenever its popup or options page opens, and hands a surface to Helium only while that flag's effect is observed. Turn it off to manage the switches by hand:

- Enable **Use Helium measureText noise** only with `helium://flags/#fingerprinting-canvas-measuretext-noise`; otherwise Ghost owns `CanvasRenderingContext2D.measureText` protection.
- Enable **Use Helium WebGL info spoofing** only with `helium://flags/#spoof-webgl-info`; Ghost and Helium must not both spoof the WebGL vendor/renderer.
- Enable **Use Helium UA reduction** with Helium's `reduced-system-info` or `remove-client-hints` flag; Ghost then leaves User-Agent, UA Client Hints, and platform surfaces unchanged. The Advanced build never stacks a separate CDP User-Agent override on either owner.

## Automatic network location

The opt-in **Match location to public IP** setting queries `https://my.ippure.com/v1/info` at startup and periodically while enabled. Ghost validates and caches only the returned timezone, country/region/city, and coordinates; it does not store the returned IP address. Network lookup and open-tab reapplication run outside the settings-page loading path. Use the refresh button beside **Detected location** to request an immediate update. The cached location overrides the selected profile's timezone and uses city-level geolocation accuracy while keeping its device identity and fingerprint seed stable.

Language behavior is independent: **Keep profile language** preserves the selected profile's locale and request language, while **Auto** derives `navigator.language`, `navigator.languages`, Intl locale, and `Accept-Language` from the detected VPN region. IP geolocation databases can disagree, so this improves consistency but cannot guarantee an exact match on every site.

Ghost only reports page-level fingerprint protection when its startup payload can be injected synchronously. Enable **Allow User Scripts** in the extension's details (Chrome 138+) or Developer mode on older supported Chromium. Without that authorization Ghost reports **Unprotected** and does not install the asynchronous page-world fallback, because a page could read the native fingerprint before its configured profile arrived. Reopen the popup after granting access to repair registration automatically.

## Time zones

Profiles accept any IANA zone the browser itself supports, including `UTC` and the fixed-offset `Etc/GMT±N` zones that `Intl.supportedValuesOf("timeZone")` leaves out (POSIX sign convention: `Etc/GMT-8` is UTC+08:00). Identifiers are stored in the form Chromium reports for that zone, for example `Asia/Calcutta` for `Asia/Kolkata` and `UTC` for `Etc/UTC`, so a spoofed page resolves to exactly what a real browser in that zone would return.

## Scope

Ghost targets common JavaScript and request-header fingerprinting. It does not claim to hide IP address, DNS, TLS/JA3, HTTP/2, GPU process, browser-kernel, or manual visual signals. The profile's WebGL vendor/renderer pair is reported through `WEBGL_debug_renderer_info` in documents and in supported blob-URL dedicated workers, and WebGPU's `GPUAdapterInfo` vendor/architecture is derived from the same strings so the two GPU surfaces agree; the plain `VENDOR`/`RENDERER` enums keep Chromium's fixed `WebKit` values, and WebGPU limits and features remain native. Client hints report a per-profile OS version (`platformVersion`, defaulting to a current macOS release, the Linux kernel line, or Windows 10) instead of the frozen version in the User-Agent string. Font and emoji rendering cannot be fully replaced from a normal extension. Ghost partitions font exposure and, unless delegated to Helium, text-measurement outputs. It deliberately leaves Canvas pixel readback and serialization to the browser: post-processing those bytes in the extension creates a distinguishable artificial-noise signal.

### Blob Worker compatibility

Ghost composes tracked Blob Worker source and its GPU identity setup into one entry script. It does not add an `importScripts()` or dynamic `import()` loader: a site's CSP may allow Blob Worker entry scripts but forbid importing Blob scripts inside them. The site's CSP is not modified.

The Blob observer preserves the native constructor and bytes and records strict/sloppy directive mode only when it can be determined safely from plain string parts. Workers with untracked or indeterminate source (for example binary parts, iterators, hashbangs, or ambiguous directive prologues) remain native, including their GPU surface. This is a Worker-only compatibility fallback, not a site exclusion; page protection remains enabled. Same-origin URL workers remain native as before.

To check this failure locally after a Lite build, serve the project over HTTP on loopback and open `tests/worker-csp-smoke.html` in a browser without Ghost installed. It loads the page bundle directly and checks restrictive CSP, classic/module Worker startup and message round-trips, strict/sloppy semantics, Blob construction, and retained page/Worker protection. It is a reproduction of the loading failure, not a guarantee that any production challenge passes.
