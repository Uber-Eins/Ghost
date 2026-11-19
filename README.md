# Ghost

Ghost is a Chromium/Helium extension that gives each site a stable privacy profile. A site sees a consistent locale, language list, timezone, geolocation, platform, WebGL, and text-metric surface without telemetry. Global Privacy Control is left to Helium's own setting, which implements it in the engine for documents and workers. Ghost does not use a remote service unless the optional automatic network-location feature is enabled.

## Build

Ghost has one build, with the `debugger` permission and a runtime **Advanced overrides** switch (on by default). Turn it off to use only early page-world JavaScript patches and Declarative Net Request header rules. Ghost also falls back to those layers if Chrome DevTools Protocol (CDP) attach fails. Chromium does not allow the `debugger` permission to be optional.

## Commands

```bash
npm install
npm run build
npm run verify
```

Load `dist/advanced` as an unpacked extension in Chromium/Helium.

## Saving and startup

A successful save means settings have been stored and extension-global protection (the early page bootstrap and persistent request-header rules) has been applied. Updating already-open tabs is dispatched separately: a slow CDP target or nonresponding content-script message does not hold the save reply or popup loading. A global application failure still rejects the save and restores the previous settings/runtime configuration.

Tab updates retain ordering and skip obsolete queued revisions. Page profile replies do not wait for CDP and do not claim that a pending Advanced override has completed. Existing tabs can finish applying after the save acknowledgement; a permanently unresponsive target can still delay its own CDP work, but not the control panel or other settings commits.

Each new service-worker instance reconciles persisted global configuration, including ordinary wake-ups without an `onStartup` event. The popup/options initial load waits only for this global transaction, not all tabs. Only the service worker writes the bootstrap. Reopening the popup or options page asks it to check current User Scripts authorization; a rejected registration or update fails the settings transaction rather than removing the existing script.

## Helium compatibility

Ghost leaves AudioContext fingerprint protection and `navigator.hardwareConcurrency` entirely to Helium. Extensions cannot read `helium://flags` directly, and Helium deliberately identifies itself as Google Chrome, so Ghost does not try to detect the browser. Instead, the **Browser environment** card in the Helium compatibility settings probes the observable effects of each flag from Ghost's own pages: the fixed vendor/renderer pairs returned by `spoof-webgl-info`, empty `navigator.userAgentData` brands from `remove-client-hints`, empty high-entropy client hints from `reduced-system-info`, and per-document `measureText` scaling from `fingerprinting-canvas-measuretext-noise`. With **Set these switches from detected flags** enabled (the default for fresh installs), Ghost re-checks at startup and whenever its popup or options page opens, and hands a surface to Helium only while that flag's effect is observed. Turn it off to manage the switches by hand:

- Enable **Use Helium measureText noise** only with `helium://flags/#fingerprinting-canvas-measuretext-noise`; otherwise Ghost owns `CanvasRenderingContext2D.measureText` protection.
- Enable **Use Helium WebGL info spoofing** only with `helium://flags/#spoof-webgl-info`; Ghost and Helium must not both spoof the WebGL vendor/renderer. WebGPU adapter info stays with Ghost and follows whichever WebGL pair the document reports, including Helium's presets.
- Enable **Use Helium UA reduction** with Helium's `reduced-system-info` or `remove-client-hints` flag; Ghost then leaves User-Agent, UA Client Hints, and platform surfaces unchanged. Ghost never stacks a separate CDP User-Agent override on either owner.

Ghost's own text-metric noise (when not delegated to Helium) and geolocation jitter rotate per browser session, while the per-site profile identity stays stable. The session salt survives service-worker restarts and is not saved with settings. Restored tabs can briefly start with the previous session's registered bootstrap; those documents keep their original text noise and page-reported geolocation jitter until navigation rather than changing it mid-document or reloading. A pre-existing related-frame limitation remains: parent-mirroring same-origin `about:blank`/`srcdoc` frames and popups use an unsalted seed, so their noise differs from the top document's and a fresh same-origin iframe can still expose non-rotating Ghost `measureText` noise.

## Automatic network location

The opt-in **Match location to public IP** setting queries `https://my.ippure.com/v1/info` at startup and periodically while enabled. Ghost validates and caches only the returned timezone, country/region/city, and coordinates; it does not store the returned IP address. The network lookup stays outside the settings queue. Its result is saved and applied as a settings transaction, and open-tab reapplication runs separately. Use the refresh button beside **Detected location** to request an immediate update. The cached location overrides the selected profile's timezone and uses city-level geolocation accuracy while keeping its device identity and fingerprint seed stable.

Language behavior is independent: **Keep profile language** preserves the selected profile's locale and request language, while **Auto** derives `navigator.language`, `navigator.languages`, Intl locale, and `Accept-Language` from the detected VPN region. IP geolocation databases can disagree, so this improves consistency but cannot guarantee an exact match on every site.

Ghost only reports page-level fingerprint protection when its startup payload can be injected synchronously. Enable **Allow User Scripts** in the extension's details (Chrome 138+) or Developer mode on older supported Chromium. Without that authorization Ghost reports **Unprotected** and does not install the asynchronous page-world fallback, because a page could read the native fingerprint before its configured profile arrived. Reopen the popup after granting access to repair registration automatically.

## Time zones

Profiles accept any IANA zone the browser itself supports, including `UTC` and the fixed-offset `Etc/GMT±N` zones that `Intl.supportedValuesOf("timeZone")` leaves out (POSIX sign convention: `Etc/GMT-8` is UTC+08:00). Identifiers are stored in the form Chromium reports for that zone, for example `Asia/Calcutta` for `Asia/Kolkata` and `UTC` for `Etc/UTC`, so a spoofed page resolves to exactly what a real browser in that zone would return.

## Scope

Ghost targets common JavaScript and request-header fingerprinting. It does not claim to hide IP address, DNS, TLS/JA3, HTTP/2, GPU process, browser-kernel, or manual visual signals. The WebGL vendor/renderer pair is reported through `WEBGL_debug_renderer_info` in documents and in supported blob-URL dedicated workers, and WebGPU's `GPUAdapterInfo` vendor/architecture is derived from the same strings so the two GPU surfaces agree; the plain `VENDOR`/`RENDERER` enums keep Chromium's fixed `WebKit` values, and WebGPU limits and features remain native. Client hints report a per-profile OS version (`platformVersion`, defaulting to a current macOS release, the Linux kernel line, or Windows 10) instead of the frozen version in the User-Agent string. Font and emoji rendering cannot be fully replaced from a normal extension. Ghost partitions font exposure and, unless delegated to Helium, text-measurement outputs. It deliberately leaves Canvas pixel readback and serialization to the browser: post-processing those bytes in the extension creates a distinguishable artificial-noise signal.

With **Fixed media device list** enabled (the default), `enumerateDevices()` reports a fixed anonymous list without media permission: audio input, video input, audio output. Turn it off in Global Configuration to leave media-device APIs native. Native entries are reused where present; once any device label or device id is exposed, the native list is left unchanged for calling sites. This does not create hardware or change permissions: a site that then requests a camera on a machine without one gets the browser's normal not-found error.

### Screen

Windows profiles automatically choose a common physical panel resolution by profile id, filtering for at least 1280×720 CSS pixels at the document's device pixel ratio. If scaling excludes every panel, the largest panel is used. The profile editor's **Display and input** group can instead select a fixed panel or custom physical width/height. Physical dimensions are divided by the device pixel ratio captured once when the patch installs and rounded to CSS pixels, with a Windows 10/11 taskbar deduction (40/48 CSS pixels; unconfirmed defaults). Non-Windows, native-UA and Helium-delegated UA profiles keep native dimensions. **Report a single screen** is enabled by default (`isExtended: false`); turning it off keeps that property native without disabling profile dimensions. Same-origin related frames mirror the parent's screen. Dimensions are held for the document's lifetime, unless its profile changes; automatic mode bumps to a fitting candidate at the next document load and rounds up to 80-CSS-pixel steps if no panel fits. Fixed mode never bumps, so a window larger than the configured screen is a contradiction. Device pixel ratio stays native, as do screen orientation, color depth and window geometry. JavaScript `matchMedia` device-size checks follow the profile for pixel lengths and numeric aspect ratios, including min/max and range comparisons; unsupported units remain native. Stylesheet CSS `@media` and `getComputedStyle` are not patched and can disagree. An already-granted `window-management` permission can expose the real screens through `getScreenDetails()`; Ghost does not fake permission-gated `ScreenDetails`.

### System voices and keyboard layout

Local speech voices automatically follow the reported Windows platform and the profile's language packs; browser-provided remote voices remain native. In **Display and input**, choose **No local voices** or an explicit comma-separated list of supported Windows pack locales. The first pack provides the default voice; the remaining voices retain Windows registry order (locale, then name). These overrides still apply only to a reported Windows platform. Windows has no local en-SG or es-US pack, so those locales use truthful en-US or es-MX voices respectively, without relabelling their language. Unknown voice locales have no local list. Linux and other non-Windows profiles report no local voices; macOS voices remain native. Voices also remain native when User-Agent spoofing is delegated or the profile uses native UA mode. Profile voices are available immediately; native `voiceschanged` events are retained. Selecting a profile voice uses a native voice of the same language when available, otherwise the browser's default synthesis voice. Keyboard layout uses US, UK, German, French or Japanese writing-system keys derived from the locale, with US as the fallback; the profile editor can override that automatic choice independently of the locale; permissions-policy and frame restrictions remain native. Layout iteration retains the native map's order for shared codes and appends profile-only codes, rather than guessing Chromium's hash order. These patches do not replace installed speech engines or actual keyboard input.

### Blob Worker compatibility

Ghost composes tracked Blob Worker source and its identity setup into one entry script. That setup mirrors the page's `navigator` surface (language, languages, device memory and, unless delegated to Helium, platform, User-Agent and `userAgentData`) onto `WorkerNavigator`, together with the same `Date`/`Intl` timezone and default-locale rewriting the page uses, and WebGPU adapter identity derived from the page's reported WebGL pair (plus WebGL identity when Ghost owns it). It does not add an `importScripts()` or dynamic `import()` loader: a site's CSP may allow Blob Worker entry scripts but forbid importing Blob scripts inside them. The site's CSP is not modified.

The Blob observer preserves the native constructor and bytes and records strict/sloppy directive mode only when it can be determined safely from plain string parts. Workers with untracked or indeterminate source (for example binary parts, iterators, hashbangs, or ambiguous directive prologues) remain native, including their `navigator`, timezone and GPU surface. This is a Worker-only compatibility fallback, not a site exclusion; page protection remains enabled. Workers loaded from a URL cannot be rewritten by the page without changing their `self.location`, relative imports and CSP behavior, so they remain native, as do shared workers and service workers. Ghost does not attach its debugger to workers to cover them: doing so makes Cloudflare Turnstile reject the browser.

To check this failure locally after `npm run build`, serve the project over HTTP on loopback and open `tests/worker-csp-smoke.html` in a browser without Ghost installed. It loads the page bundle directly and checks restrictive CSP, classic/module Worker startup and message round-trips, strict/sloppy semantics, Blob construction, page/Worker `navigator` and timezone agreement, and retained page/Worker protection. It is a reproduction of the loading failure, not a guarantee that any production challenge passes.


### Options preview

For UI screenshots without installing the extension, run `npm run build:test` and serve this worktree with `python3 -m http.server 8000 --bind 127.0.0.1`. Open `http://127.0.0.1:8000/tests/options-preview.html`; add `?edit=1` to open the custom Windows profile directly, or `?edit=1&lang=zh_CN` for Simplified Chinese. The harness loads the built `dist/advanced/options.html` assets and the test API's real defaults, stubs extension APIs, and keeps all edits in memory. It is a visual development tool, not an extension integration test.
