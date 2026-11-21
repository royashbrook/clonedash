import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentPath } from "./content.mjs";

const sha = s => /^[a-f0-9]{40}$/.test(s) && !/^0+$/.test(s);
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();

// A rename, deletion, mode change, symlink, existing file edit or mixed diff takes the full lane.
export function onlyAdditions(raw) {
  const fields = raw.split("\0");
  if (fields.pop() !== "" || !fields.length || fields.length % 2) return false;
  for (let i = 0; i < fields.length; i += 2) {
    if (!/^:000000 100644 0+ [a-f0-9]+ A$/.test(fields[i]) || !contentPath.test(fields[i + 1])) return false;
  }
  return true;
}

export async function baseFor(event, e, head, live) {
  if (event === "pull_request") return e.pull_request.base.sha;
  if (event === "push") return sha(e.before) ? e.before : git("merge-base", head, "origin/main");
  // An earlier code release might never have deployed. Compare to the live version, not HEAD^.
  if (event === "workflow_run" && e.workflow_run.head_sha === head) return await live();
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let fast = false;
  try {
    const head = git("rev-parse", "HEAD"), event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
    const base = await baseFor(process.env.GITHUB_EVENT_NAME, event, head, async () => {
      const r = await fetch("https://clonedash.royashbrook.com/version.json", {cache:"no-store",signal:AbortSignal.timeout(5000)});
      return r.ok ? (await r.json()).source : null;
    });
    if (sha(base)) {
      git("merge-base", "--is-ancestor", base, head);
      fast = onlyAdditions(git("diff", "--no-renames", "--raw", "-z", base, head));
    }
  } catch (err) { console.error("Using full checks:", err.message); }
  console.log("content=" + fast);
}
