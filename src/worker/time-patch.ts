import { installTimePatches } from "../shared/time-patch";

// Bundled to a string and evaluated inside the worker identity prelude's
// function scope (see shared/worker-prelude.ts), which provides these.
declare const identity: { intlLocale: string; timezoneId: string };
declare function mask<T>(wrapper: T, native: unknown): T;

installTimePatches({
  enabled: () => true,
  intlLocale: () => identity.intlLocale,
  timezoneId: () => identity.timezoneId,
  maskAsNative: (wrapper, native) => (
    typeof native === "function" && (typeof wrapper === "function" || (typeof wrapper === "object" && wrapper !== null))
      ? mask(wrapper, native)
      : wrapper
  )
});
