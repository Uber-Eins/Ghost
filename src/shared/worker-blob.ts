const MAX_DIRECTIVE_PREFIX_LENGTH = 16_384;

// The caller supplies only strings observed during native Blob conversion.
export function strictModeForBlobParts(parts: readonly string[]): boolean | null {
  let prefix = "";
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const remaining = MAX_DIRECTIVE_PREFIX_LENGTH - prefix.length;
    prefix += part.slice(0, remaining);
    if (part.length >= remaining) return strictModeFromPrefix(prefix, false);
  }
  return strictModeFromPrefix(prefix, true);
}

function strictModeFromPrefix(prefix: string, complete: boolean): boolean | null {
  let rest = prefix;
  while (true) {
    rest = rest.replace(/^\s+/, "");
    if (rest.startsWith("//")) {
      const end = rest.search(/[\r\n\u2028\u2029]/);
      if (end < 0) {
        return complete ? false : null;
      }
      rest = rest.slice(end);
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      if (end < 0) {
        return null;
      }
      rest = rest.slice(end + 2);
      continue;
    }
    if (!rest) {
      return complete ? false : null;
    }
    if (!complete && ["//", "/*", "#!", "<!--", "-->"].some((token) => token.startsWith(rest))) {
      return null;
    }
    // A prepended executable statement would invalidate a hashbang. Also
    // leave Annex B HTML comments alone instead of guessing their extent.
    if (rest.startsWith("#!") || rest.startsWith("<!--") || rest.startsWith("-->")) {
      return null;
    }
    if (rest[0] !== '"' && rest[0] !== "'") {
      return false;
    }
    const literal = /^(?:"(?:[^"\\\r\n\u2028\u2029]|\\[\s\S])*"|'(?:[^'\\\r\n\u2028\u2029]|\\[\s\S])*')/.exec(rest)?.[0];
    if (!literal) {
      return null;
    }
    const suffix = rest.slice(literal.length).replace(/^\s+/, "");
    // Require an explicit semicolon (or a complete end-of-script). ASI and
    // comments between a literal and its terminator are deliberately left
    // native; e.g. "use strict"\n(function(){})() is not a directive.
    if (!suffix.startsWith(";") && !(complete && suffix === "")) {
      return null;
    }
    if (literal === '"use strict"' || literal === "'use strict'") {
      return true;
    }
    rest = suffix.slice(1);
  }
}
