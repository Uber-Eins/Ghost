import { build as esbuildBuild } from "esbuild";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build as viteBuild } from "vite";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--test")) {
  throw new Error(`Unknown build argument: ${args.join(" ")}`);
}
const includeTestApis = args.includes("--test");
const channel = "ghost-profile-v1";
const testOutdir = path.join(root, "dist", "test");

if (includeTestApis) {
  await rm(testOutdir, { recursive: true, force: true });
  await mkdir(testOutdir, { recursive: true });
}

// Date/Intl rewriting for worker globals, embedded as source text in the
// worker identity prelude.
const workerTimePatch = (await esbuildBuild({
  entryPoints: [path.join(root, "src/worker/time-patch.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  minify: true,
  write: false,
  logLevel: "warning"
})).outputFiles[0].text.trim();

await buildExtension();

async function buildExtension() {
  const outdir = path.join(root, "dist", "advanced");
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const define = {
    __GHOST_CHANNEL__: JSON.stringify(channel),
    __GHOST_WORKER_TIME_PATCH__: JSON.stringify(workerTimePatch)
  };

  await esbuildBuild({
    entryPoints: {
      background: path.join(root, "src/background/index.ts")
    },
    outdir,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    sourcemap: true,
    define,
    logLevel: "info"
  });

  const scriptBundles = [
    bundleIife("src/content/main.ts", "page-main.js", outdir, {
      ...define,
      __GHOST_RELATED_ONLY__: "false"
    }),
    bundleIife("src/content/main.ts", "page-related.js", outdir, {
      ...define,
      __GHOST_RELATED_ONLY__: "true"
    }),
    bundleIife("src/content/bridge.ts", "content-bridge.js", outdir, define),
    bundleIife("src/popup/popup.ts", "popup.js", outdir, define)
  ];
  if (includeTestApis) {
    scriptBundles.push(
      bundleEsm("src/test-api.ts", "test-api.js", testOutdir, define),
      bundleEsm("src/dnr-test-api.ts", "dnr-test-api.js", testOutdir, define),
      bundleEsm("src/advanced-test-api.ts", "advanced-test-api.js", testOutdir, define)
    );
  }
  await Promise.all(scriptBundles);

  await bundleOptionsPage(outdir, define);

  await Promise.all([
    cp(path.join(root, "src/popup/popup.html"), path.join(outdir, "popup.html")),
    cp(path.join(root, "src/popup/popup.css"), path.join(outdir, "popup.css")),
    cp(path.join(root, "src/icons"), path.join(outdir, "icons"), { recursive: true }),
    cp(path.join(root, "src/_locales"), path.join(outdir, "_locales"), { recursive: true })
  ]);

  await writeFile(path.join(outdir, "manifest.json"), JSON.stringify(manifest(), null, 2));
  await writeFile(path.join(outdir, "README.txt"), await readFile(path.join(root, "README.md"), "utf8"));
}

function bundleIife(entry, outfile, outdir, define) {
  return esbuildBuild({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(outdir, outfile),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    sourcemap: true,
    define,
    logLevel: "info"
  });
}

function bundleEsm(entry, outfile, outdir, define) {
  return esbuildBuild({
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

function bundleOptionsPage(outdir, define) {
  return viteBuild({
    root: path.join(root, "src/options"),
    base: "./",
    publicDir: false,
    configFile: false,
    plugins: [react(), tailwindcss()],
    define,
    resolve: {
      alias: {
        "@": path.join(root, "src")
      }
    },
    build: {
      outDir: outdir,
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        input: path.join(root, "src/options/options.html"),
        output: {
          entryFileNames: "options.js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]"
        }
      }
    }
  });
}

function manifest() {
  const permissions = [
    "alarms",
    "debugger",
    "declarativeNetRequestWithHostAccess",
    "scripting",
    "storage",
    "tabs",
    "userScripts"
  ];

  return {
    manifest_version: 3,
    name: "__MSG_extensionName__",
    short_name: "__MSG_extensionShortName__",
    version: "0.1.0",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    minimum_chrome_version: "120",
    permissions,
    host_permissions: ["http://*/*", "https://*/*", "file:///*"],
    action: {
      default_title: "__MSG_defaultTitle__",
      default_popup: "popup.html",
      default_icon: iconSet("enabled")
    },
    icons: iconSet("enabled"),
    options_page: "options.html",
    background: {
      service_worker: "background.js",
      type: "module"
    },
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*", "file:///*"],
        js: ["content-bridge.js"],
        run_at: "document_start",
        all_frames: true,
        world: "ISOLATED",
        match_about_blank: true,
        match_origin_as_fallback: true
      }
    ]
  };
}

function iconSet(state) {
  return {
    16: `icons/${state}-16.png`,
    32: `icons/${state}-32.png`,
    48: `icons/${state}-48.png`,
    128: `icons/${state}-128.png`
  };
}
