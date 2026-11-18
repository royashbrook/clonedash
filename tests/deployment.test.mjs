import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("production accepts only successful trusted main pushes or manual main runs", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy.yml", import.meta.url),
    "utf8",
  );
  const expression = workflow.match(/    if: >-\n([\s\S]*?)    runs-on:/)[1];
  const accepts = new Function("github", `return (${expression});`);
  const github = {
    repository: "owner/game",
    event_name: "workflow_run",
    ref: "refs/heads/main",
    event: {
      workflow_run: {
        conclusion: "success",
        event: "push",
        head_branch: "main",
        head_repository: { full_name: "owner/game" },
      },
    },
  };
  assert.equal(accepts(github), true);
  for (const [field, value] of [
    ["conclusion", "failure"],
    ["conclusion", "cancelled"],
    ["event", "pull_request"],
    ["head_branch", "feature"],
    ["head_repository", { full_name: "fork/game" }],
  ]) {
    const rejected = structuredClone(github);
    rejected.event.workflow_run[field] = value;
    assert.equal(accepts(rejected), false, field);
  }
  assert.equal(
    accepts({ ...github, event_name: "workflow_dispatch", event: {} }),
    true,
  );
  assert.ok(
    !accepts({
      ...github,
      event_name: "workflow_dispatch",
      ref: "refs/heads/feature",
      event: { workflow_run: {} },
    }),
  );
  assert.ok(workflow.includes("ref: main"));
  assert.ok(workflow.includes("fetch-depth: 0"));
  assert.ok(workflow.includes("cancel-in-progress: false"));
  assert.ok(workflow.includes("RELEASE_BUILD=1 npm run build"));
  assert.ok(workflow.includes("- run: npm run check"));
  assert.ok(workflow.includes("- run: npm run test:browser"));
  assert.ok(
    !workflow.includes("- if: github.event_name == 'workflow_dispatch'"),
  );
  assert.ok(
    workflow.includes(
      'test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"',
    ),
  );
  // Superseded check, then deploy, then the live receipt against the same HEAD.
  const order = [
    "Refuse a superseded release",
    "npx wrangler deploy",
    'node scripts/verify-live.mjs https://clonedash.royashbrook.com "$(git rev-parse HEAD)"',
  ].map((step) => workflow.indexOf(step));
  assert.ok(
    order.every((at) => at >= 0),
    String(order),
  );
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.ok(!workflow.slice(order[1]).includes("npm run build"));
});

test("analytics CSP permits only the approved additions and retains object protection", () => {
  const headers = readFileSync(
    new URL("../public/_headers", import.meta.url),
    "utf8",
  );
  assert.ok(
    headers.includes(
      "script-src 'self' https://static.cloudflareinsights.com;",
    ),
  );
  assert.ok(
    headers.includes("connect-src 'self' https://cloudflareinsights.com;"),
  );
  assert.ok(headers.includes("object-src 'none'"));
  assert.ok(!headers.includes("unsafe-inline"));
});

// #105: a pass that needed a retry is a failure on CI, and both workflows keep the
// results of every run, so the first attempt's trace survives a retry that passed
test("on CI a retried pass fails the run and every run keeps its browser results", async () => {
  const load = async (ci) => {
    const saved = process.env.CI;
    if (ci) process.env.CI = "true";
    else delete process.env.CI;
    try {
      return (await import(`../playwright.config.js?ci=${ci}`)).default;
    } finally {
      if (saved === undefined) delete process.env.CI;
      else process.env.CI = saved;
    }
  };
  const [ci, local] = [await load(true), await load(false)];
  assert.equal(ci.failOnFlakyTests, true);
  assert.equal(local.failOnFlakyTests, false);
  const retries = (config, name) => config.projects.find((p) => p.name === name).retries ?? 0;
  assert.deepEqual([retries(ci, "chromium"), retries(ci, "webkit")], [0, 1]);
  assert.deepEqual([retries(local, "chromium"), retries(local, "webkit")], [0, 0]);
  assert.equal(ci.timeout, 60000);
  for (const name of ["check.yml", "deploy.yml"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
    const upload = workflow.match(/- uses: actions\/upload-artifact@v7\n(?:\s+#.*\n)*\s+if: (.+)\n[\s\S]*?path: (.+)\n/);
    assert.ok(upload, name);
    assert.deepEqual([upload[1], upload[2]], ["always()", "test-results/"], name);
    assert.ok(workflow.indexOf("- run: npm run test:browser") < workflow.indexOf("actions/upload-artifact"), name);
  }
});

test("both workflows run in the official Playwright image whose tag is the exact package version, with no second browser install (#122)", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")),
    version = pkg.devDependencies["@playwright/test"];
  assert.match(version, /^\d+\.\d+\.\d+$/, "an exact version, so the image tag can match it");
  for (const name of ["check.yml", "deploy.yml"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
    assert.match(workflow, new RegExp(`container:\\n\\s+image: mcr\\.microsoft\\.com/playwright:v${version.replaceAll(".", "\\.")}-noble\\n`), name);
    assert.doesNotMatch(workflow, /playwright install/, name);
  }
});
