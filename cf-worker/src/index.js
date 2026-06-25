// Cloudflare Worker: trigger GitHub Actions workflow_dispatch moi 30 phut.
// Giai phap cho GitHub Actions scheduled cron bi throttle tren repo it hoat dong.
// Cloudflare cron chay dung gio, sau do GitHub chay ngay lap tuc (workflow_dispatch, khong queue).
//
// Setup:
//   npx wrangler secret put GITHUB_TOKEN   (GitHub PAT voi scope: workflow)
//   npx wrangler deploy

export default {
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
