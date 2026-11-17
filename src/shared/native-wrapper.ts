// Keep the replaced realm's native target: V8 exposes a native surface even
// through another realm's Function.prototype.toString, and preserves its shape.
export function wrapNative<T extends Function>(
  native: T,
  apply: NonNullable<ProxyHandler<T>["apply"]>,
  construct?: ProxyHandler<T>["construct"]
): T {
  return new Proxy(native, { apply, ...(construct ? { construct } : {}) });
}

// Some synthetic surfaces have no native counterpart on older/insecure realms.
// Leave those methods synthetic rather than borrowing an unrelated native.
export function wrapNativeMethod<T extends Function>(native: unknown, implementation: T): T {
  return typeof native === "function"
    ? wrapNative(native, (_target, receiver, args) => Reflect.apply(implementation, receiver, args)) as T
    : implementation;
}
