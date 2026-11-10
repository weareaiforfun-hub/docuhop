// Builds the "DocuHop is paused" site into dist/: the notice page as index.html and 404.html (so every old link shows
// it), plus CNAME and the favicon. The deploy workflow runs this instead of the app build while a PAUSED file exists.
// A non-empty PAUSED file replaces the notice's first sentence. Usage: node scripts/build-pause.mjs [outDir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const out = new URL((process.argv[2] ?? "dist").replace(/\/?$/, "/"), root);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let html = readFileSync(new URL("pause/index.html", root), "utf8");
const pausedFile = new URL("PAUSED", root);
const message = existsSync(pausedFile) ? readFileSync(pausedFile, "utf8").trim() : "";
if (message) html = html.replace(/<!--MESSAGE-->[\s\S]*?<!--\/MESSAGE-->/, esc(message));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(new URL("index.html", out), html);
writeFileSync(new URL("404.html", out), html);
for (const f of ["CNAME", "favicon.svg"]) copyFileSync(new URL("public/" + f, root), new URL(f, out));
console.log(`Notice page built in ${out.pathname}${message ? " with the message from PAUSED" : ""}.`);
