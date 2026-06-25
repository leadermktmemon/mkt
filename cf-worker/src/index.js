// Cloudflare Worker "mkt":
//   fetch()     -> serve dashboard static files (marketing-report/dashboard/)
//   scheduled() -> trigger GitHub Actions workflow_dispatch moi 30 phut

export default {
  // Pass HTTP requests den assets (dashboard index.html, data.js, thumbs/, ...)
  async fetch(request, env, ctx) {
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    const repo = env.GITHUB_REPO || "leadermktmemon/mkt";
    const url = `https://api.github.com/repos/${repo}/actions/workflows/daily-report.yml/dispatches`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "CF-Cron-Trigger/1.0",
      },
      body: JSON.stringify({ ref: "main" }),
    });

    const msg = `[${new Date().toISOString()}] dispatch → ${res.status} ${res.statusText}`;
    console.log(msg);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GitHub dispatch failed: ${body}`);
    }
  },
};
