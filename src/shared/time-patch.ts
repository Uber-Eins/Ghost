import { wrapNative } from "./native-wrapper";
import { constructDateWithNewTarget } from "./date-constructor";
import {
  dateFromZonedLocalParts,
  formatSpoofedTimeString,
  getOffsetLabel,
  getTimezoneOffsetMinutes,
  getZonedParts
} from "./timezone";

// Date and Intl rewriting shared by the page and by worker globals, so both
// report the profile's timezone and default locale through one implementation.
export interface TimePatchContext {
  enabled(): boolean;
  intlLocale(): string;
  timezoneId(): string;
  maskAsNative<T>(wrapper: T, native: unknown): T;
}

const NativeDate = Date;
const NativeIntl = {
  DateTimeFormat: Intl.DateTimeFormat,
  NumberFormat: Intl.NumberFormat,
  Collator: Intl.Collator,
  PluralRules: Intl.PluralRules,
  RelativeTimeFormat: Intl.RelativeTimeFormat,
  ListFormat: Intl.ListFormat,
  DisplayNames: Intl.DisplayNames,
  Segmenter: Intl.Segmenter
};
const injectedLocales = new WeakMap<object, string>();

export function installTimePatches(context: TimePatchContext): void {
  patchIntl(context);
  patchDate(context);
}

function patchIntl(context: TimePatchContext): void {
  patchIntlConstructor(context, "DateTimeFormat", true);
  patchIntlConstructor(context, "NumberFormat");
  patchIntlConstructor(context, "Collator");
  patchIntlConstructor(context, "PluralRules");
  patchIntlConstructor(context, "RelativeTimeFormat");
  patchIntlConstructor(context, "ListFormat");
  patchIntlConstructor(context, "DisplayNames");
  patchIntlConstructor(context, "Segmenter");
}

function patchIntlConstructor(context: TimePatchContext, name: keyof typeof NativeIntl, injectTimeZone = false): void {
  const { maskAsNative } = context;
  const NativeConstructor = NativeIntl[name] as unknown as new (...args: unknown[]) => object;
  if (typeof NativeConstructor !== "function") {
    return;
  }

  function createInstance(args: unknown[], receiver: unknown, newTarget?: Function): object {
    if (!context.enabled()) {
      return newTarget ? Reflect.construct(NativeConstructor, args, newTarget)
        : Reflect.apply(NativeConstructor, receiver, args) as object;
    }
    const [locales, options] = args;
    const locale = locales === undefined ? context.intlLocale() : undefined;
    const nextArgs = [locale ?? locales, injectTimeZone ? withTimeZone(context, options) : options];
    const instance = newTarget ? Reflect.construct(NativeConstructor, nextArgs, newTarget)
      : Reflect.apply(NativeConstructor, receiver, nextArgs) as object;
    if (locale) injectedLocales.set(instance, locale);
    return instance;
  }

  const Wrapped = maskAsNative(wrapNative(NativeConstructor,
    (_target, receiver, args) => createInstance(args, receiver),
    (_target, args, newTarget) => createInstance(args, undefined, newTarget)
  ), NativeConstructor);
  // The proxy shares the native prototype; keep the public constructor identity.
  Object.defineProperty(NativeConstructor.prototype, "constructor", {
    ...Object.getOwnPropertyDescriptor(NativeConstructor.prototype, "constructor"),
    value: Wrapped
  });

  const nativeResolvedOptions = (NativeConstructor.prototype as { resolvedOptions?: () => Record<string, unknown> }).resolvedOptions;
  if (nativeResolvedOptions) {
    Object.defineProperty(NativeConstructor.prototype, "resolvedOptions", {
      configurable: true,
      value: maskAsNative(wrapNative(nativeResolvedOptions, (target, receiver, args) => {
        const result = Reflect.apply(target, receiver, args) as Record<string, unknown>;
        // Some constructors resolve a profile tag to a less specific locale.
        const locale = injectedLocales.get(receiver);
        if (context.enabled() && locale) result.locale = locale;
        return result;
      }), nativeResolvedOptions)
    });
  }

  Object.defineProperty(Intl, name, {
    configurable: true,
    writable: true,
    value: Wrapped
  });
}

function patchDate(context: TimePatchContext): void {
  const { maskAsNative } = context;
  const nativeGetTime = NativeDate.prototype.getTime;
  const nativeGetTimezoneOffset = NativeDate.prototype.getTimezoneOffset;
  const nativeToString = NativeDate.prototype.toString;
  const nativeToDateString = NativeDate.prototype.toDateString;
  const nativeToTimeString = NativeDate.prototype.toTimeString;
  const nativeToLocaleString = NativeDate.prototype.toLocaleString;
  const nativeToLocaleDateString = NativeDate.prototype.toLocaleDateString;
  const nativeToLocaleTimeString = NativeDate.prototype.toLocaleTimeString;
  const nativeGetYear = (NativeDate.prototype as Date & { getYear?: (this: Date) => number }).getYear;
  const nativeGetters = {
    getFullYear: NativeDate.prototype.getFullYear,
    getMonth: NativeDate.prototype.getMonth,
    getDate: NativeDate.prototype.getDate,
    getDay: NativeDate.prototype.getDay,
    getHours: NativeDate.prototype.getHours,
    getMinutes: NativeDate.prototype.getMinutes,
    getSeconds: NativeDate.prototype.getSeconds,
    getMilliseconds: NativeDate.prototype.getMilliseconds
  };

  function dateFromThis(value: Date): Date {
    return new NativeDate(nativeGetTime.call(value));
  }

  Object.defineProperties(NativeDate.prototype, {
    getTimezoneOffset: {
      configurable: true,
      value: function getTimezoneOffset(this: Date) {
        if (!context.enabled() || Number.isNaN(nativeGetTime.call(this))) {
          return nativeGetTimezoneOffset.call(this);
        }
        return getTimezoneOffsetMinutes(dateFromThis(this), context.timezoneId(), NativeIntl.DateTimeFormat);
      }
    },
    getYear: {
      configurable: true,
      value: function getYear(this: Date) {
        if (!context.enabled() || Number.isNaN(nativeGetTime.call(this))) {
          return typeof nativeGetYear === "function"
            ? nativeGetYear.call(this)
            : nativeGetters.getFullYear.call(this) - 1900;
        }
        return getZonedParts(dateFromThis(this), context.timezoneId(), "en-US", NativeIntl.DateTimeFormat).year - 1900;
      }
    },
    getFullYear: { configurable: true, value: zonedGetter("year", nativeGetters.getFullYear) },
    getMonth: { configurable: true, value: zonedGetter("month", nativeGetters.getMonth, -1) },
    getDate: { configurable: true, value: zonedGetter("day", nativeGetters.getDate) },
    getDay: { configurable: true, value: zonedGetter("weekday", nativeGetters.getDay) },
    getHours: { configurable: true, value: zonedGetter("hour", nativeGetters.getHours) },
    getMinutes: { configurable: true, value: zonedGetter("minute", nativeGetters.getMinutes) },
    getSeconds: { configurable: true, value: zonedGetter("second", nativeGetters.getSeconds) },
    getMilliseconds: {
      configurable: true,
      value: function getMilliseconds(this: Date) {
        return nativeGetters.getMilliseconds.call(this);
      }
    },
    toString: {
      configurable: true,
      value: function toString(this: Date) {
        if (!context.enabled() || Number.isNaN(nativeGetTime.call(this))) {
          return nativeToString.call(this);
        }
        return formatDateTime(context, dateFromThis(this));
      }
    },
    toDateString: {
      configurable: true,
      value: function toDateString(this: Date) {
        if (!context.enabled() || Number.isNaN(nativeGetTime.call(this))) {
          return nativeToDateString.call(this);
        }
        return formatDateOnly(context, dateFromThis(this));
      }
    },
    toTimeString: {
      configurable: true,
      value: function toTimeString(this: Date) {
        if (!context.enabled() || Number.isNaN(nativeGetTime.call(this))) {
          return nativeToTimeString.call(this);
        }
        return formatTimeOnly(context, dateFromThis(this));
      }
    },
    toLocaleString: {
      configurable: true,
      value: function toLocaleString(this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        if (!context.enabled()) {
          return nativeToLocaleString.call(this, locales, options);
        }
        return nativeToLocaleString.call(this, locales === undefined ? context.intlLocale() : locales, withTimeZone(context, options));
      }
    },
    toLocaleDateString: {
      configurable: true,
      value: function toLocaleDateString(this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        if (!context.enabled()) {
          return nativeToLocaleDateString.call(this, locales, options);
        }
        return nativeToLocaleDateString.call(this, locales === undefined ? context.intlLocale() : locales, withTimeZone(context, options));
      }
    },
    toLocaleTimeString: {
      configurable: true,
      value: function toLocaleTimeString(this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        if (!context.enabled()) {
          return nativeToLocaleTimeString.call(this, locales, options);
        }
        return nativeToLocaleTimeString.call(this, locales === undefined ? context.intlLocale() : locales, withTimeZone(context, options));
      }
    }
  });

  const nativeDateMethods: Record<string, unknown> = {
    ...nativeGetters,
    getTimezoneOffset: nativeGetTimezoneOffset,
    getYear: nativeGetYear,
    toString: nativeToString,
    toDateString: nativeToDateString,
    toTimeString: nativeToTimeString,
    toLocaleString: nativeToLocaleString,
    toLocaleDateString: nativeToLocaleDateString,
    toLocaleTimeString: nativeToLocaleTimeString
  };
  for (const [name, native] of Object.entries(nativeDateMethods)) {
    const implementation = (NativeDate.prototype as unknown as Record<string, Function>)[name];
    if (typeof native === "function") {
      Object.defineProperty(NativeDate.prototype, name, {
        value: maskAsNative(wrapNative(native, (_target, receiver, args) => Reflect.apply(implementation, receiver, args)), native)
      });
    }
  }

  const GhostDate = maskAsNative(wrapNative(NativeDate,
    () => new NativeDate().toString(),
    (_target, args, newTarget) => constructDate(context, args, newTarget)
  ), NativeDate);
  Object.defineProperty(NativeDate.prototype, "constructor", {
    ...Object.getOwnPropertyDescriptor(NativeDate.prototype, "constructor"),
    value: GhostDate
  });
  Object.defineProperty(globalThis, "Date", {
    configurable: true,
    writable: true,
    value: GhostDate
  });

  function zonedGetter(key: keyof ReturnType<typeof getZonedParts>, nativeGetter: (this: Date) => number, adjustment = 0) {
    return function getter(this: Date) {
      if (!context.enabled() || Number.isNaN(nativeGetTime.call(this))) {
        return nativeGetter.call(this);
      }
      return getZonedParts(dateFromThis(this), context.timezoneId(), "en-US", NativeIntl.DateTimeFormat)[key] + adjustment;
    };
  }
}

function constructDate(context: TimePatchContext, args: unknown[], newTarget: Function): Date {
  if (context.enabled() && args.length >= 2) {
    const date = dateFromZonedLocalParts(
      context.timezoneId(),
      Number(args[0]),
      Number(args[1]),
      args.length >= 3 ? Number(args[2]) : 1,
      args.length >= 4 ? Number(args[3]) : 0,
      args.length >= 5 ? Number(args[4]) : 0,
      args.length >= 6 ? Number(args[5]) : 0,
      args.length >= 7 ? Number(args[6]) : 0,
      NativeIntl.DateTimeFormat
    );
    return constructDateWithNewTarget(NativeDate, [date.getTime()], newTarget);
  }

  return constructDateWithNewTarget(NativeDate, args, newTarget);
}

function withTimeZone(context: TimePatchContext, options: unknown): Intl.DateTimeFormatOptions {
  // Preserve native rejection of null and native property access (including
  // inherited getters and their receiver). An empty target also permits substitution
  // when a frozen options object has an undefined timeZone.
  if (options === null) return options as unknown as Intl.DateTimeFormatOptions;
  const source = options === undefined ? Object.create(null) : Object(options);
  return new Proxy(Object.create(null), {
    get(_target, key) {
      const value = Reflect.get(source, key);
      return key === "timeZone" && value === undefined ? context.timezoneId() : value;
    }
  });
}

function formatDateTime(context: TimePatchContext, date: Date): string {
  return `${formatDateOnly(context, date)} ${formatTimeOnly(context, date)}`;
}

function formatDateOnly(context: TimePatchContext, date: Date): string {
  const parts = getZonedParts(date, context.timezoneId(), "en-US", NativeIntl.DateTimeFormat);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parts.weekday];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parts.month - 1];
  return `${weekday} ${month} ${pad(parts.day)} ${parts.year}`;
}

function formatTimeOnly(context: TimePatchContext, date: Date): string {
  const parts = getZonedParts(date, context.timezoneId(), "en-US", NativeIntl.DateTimeFormat);
  const offset = getTimezoneOffsetMinutes(date, context.timezoneId(), NativeIntl.DateTimeFormat);
  const name = timeZoneName(context, date);
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} ${getOffsetLabel(offset)} (${name})`;
}

function timeZoneName(context: TimePatchContext, date: Date): string {
  const formatted = formatSpoofedTimeString(date, "en-US", context.timezoneId(), NativeIntl.DateTimeFormat);
  const match = formatted.match(/\(([^)]+)\)$/);
  if (match) {
    return match[1];
  }
  const chunks = formatted.split(" ");
  return chunks.slice(1).join(" ") || context.timezoneId();
}

function pad(value: number): string {
  return Math.trunc(value).toString().padStart(2, "0");
}
