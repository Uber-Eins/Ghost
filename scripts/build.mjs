import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = parseTargets(process.argv.slice(2));
const channel = "ghost-profile-v1";

for (const target of targets) {
  await buildTarget(target);
}

function parseTargets(args) {
  const requested = args.filter(Boolean);
  if (requested.length === 0) {
    return ["lite", "advanced"];
  }
  for (const target of requested) {
    if (!["lite", "advanced"].includes(target)) {
      throw new Error(`Unknown build target: ${target}`);
    }
  }
  return requested;
}

async function buildTarget(target) {
  const outdir = path.join(root, "dist", target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const define = {
    __GHOST_BUILD__: JSON.stringify(target),
    __GHOST_CHANNEL__: JSON.stringify(channel)
  };

  await build({
    entryPoints: {
      background: path.join(root, "src/background/index.ts")
    },
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome116",
    sourcemap: true,
    define,
    logLevel: "info"
  });

  await Promise.all([
    bundleIife("src/content/main.ts", "page-main.js", outdir, define),
    bundleIife("src/content/bridge.ts", "content-bridge.js", outdir, define),
    bundleIife("src/popup/popup.ts", "popup.js", outdir, define),
    bundleIife("src/options/options.ts", "options.js", outdir, define),
    bundleIife("src/fingerprint/fingerprint.ts", "fingerprint.js", outdir, define),
    bundleEsm("src/test-api.ts", "test-api.js", outdir, define)
  ]);

  await Promise.all([
    cp(path.join(root, "src/popup/popup.html"), path.join(outdir, "popup.html")),
    cp(path.join(root, "src/popup/popup.css"), path.join(outdir, "popup.css")),
    cp(path.join(root, "src/options/options.html"), path.join(outdir, "options.html")),
    cp(path.join(root, "src/options/options.css"), path.join(outdir, "options.css")),
    cp(path.join(root, "src/fingerprint/fingerprint.html"), path.join(outdir, "fingerprint.html")),
    cp(path.join(root, "src/fingerprint/fingerprint.css"), path.join(outdir, "fingerprint.css"))
  ]);

  await writeFile(path.join(outdir, "manifest.json"), JSON.stringify(manifest(target), null, 2));
  await writeFile(path.join(outdir, "README.txt"), await buildReadme(target));
}

function bundleIife(entry, outfile, outdir, define) {
  return build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(outdir, outfile),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome116",
    sourcemap: true,
    define,
    logLevel: "info"
  });
}

function bundleEsm(entry, outfile, outdir, define) {
  return build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(outdir, outfile),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    sourcemap: true,
    define,
    logLevel: "info"
  });
}

function manifest(target) {
  const permissions = [
    "activeTab",
    "declarativeNetRequest",
    "storage",
    "tabs"
  ];
  if (target === "advanced") {
    permissions.push("debugger");
  }

  return {
    manifest_version: 3,
    name: target === "advanced" ? "Ghost Privacy Advanced" : "Ghost Privacy Lite",
    short_name: "Ghost",
    version: "0.1.0",
    description: "Stable per-site browser profiles for common JavaScript and header fingerprinting surfaces.",
    minimum_chrome_version: "116",
    permissions,
    host_permissions: ["http://*/*", "https://*/*"],
    action: {
      default_title: "Ghost",
      default_popup: "popup.html"
    },
    options_page: "options.html",
    background: {
      service_worker: "background.js",
      type: "module"
    },
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*", "file://*/*"],
        js: ["page-main.js"],
        run_at: "document_start",
        all_frames: true,
        world: "MAIN"
      },
      {
        matches: ["http://*/*", "https://*/*", "file://*/*"],
        js: ["content-bridge.js"],
        run_at: "document_start",
        all_frames: true,
        world: "ISOLATED"
      }
    ].reverse(),
    web_accessible_resources: [
      {
        resources: ["fingerprint.html", "fingerprint.css", "fingerprint.js"],
        matches: ["http://*/*", "https://*/*"]
      }
    ],
    declarative_net_request: {
      rule_resources: []
    }
  };
}

async function buildReadme(target) {
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  return `Ghost ${target} build\n\n${readme}`;
}
