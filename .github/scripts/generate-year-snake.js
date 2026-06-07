const fs = require("node:fs/promises");
const path = require("node:path");

const userName = process.env.GITHUB_USER_NAME || "henryfan000418";

const now = new Date();
const year = now.getUTCFullYear();
const firstDay = `${year}-01-01`;
const today = now.toISOString().slice(0, 10);
const sourceUrl = `https://github.com/users/${userName}/contributions?from=${firstDay}&to=${today}`;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAttr(fragment, name) {
  const match = fragment.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : "";
}

function parseContributionCount(html, cellId) {
  const tooltipPattern = new RegExp(
    `<tool-tip[^>]*for="${cellId}"[^>]*>([\\s\\S]*?)<\\/tool-tip>`,
    "i",
  );
  const match = html.match(tooltipPattern);
  if (!match) return 0;

  const text = match[1].replace(/<[^>]+>/g, "").trim();
  if (/No contributions/i.test(text)) return 0;

  const countMatch = text.match(/([0-9,]+)\s+contribution/i);
  return countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0;
}

async function fetchGitHubCalendar() {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "current-year-github-contribution-snake",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub contribution calendar failed: ${response.status} ${await response.text()}`);
  }

  const html = await response.text();
  const cellPattern = /<td\b[^>]*class="[^"]*ContributionCalendar-day[^"]*"[^>]*>/g;
  const cells = [];

  for (const match of html.matchAll(cellPattern)) {
    const fragment = match[0];
    const date = getAttr(fragment, "data-date");
    if (!date || date < firstDay || date > today) continue;

    const id = getAttr(fragment, "id");
    const position = id.match(/contribution-day-component-(\d+)-(\d+)/);
    if (!position) continue;

    const weekday = Number(position[1]);
    const week = Number(position[2]);
    const level = Number(getAttr(fragment, "data-level") || 0);
    const count = parseContributionCount(html, id);

    cells.push({
      count,
      date,
      level,
      week,
      weekday,
    });
  }

  if (cells.length === 0) {
    throw new Error(`No contribution calendar cells found at ${sourceUrl}`);
  }

  return cells;
}

function makeSvg(cells, theme) {
  const cell = 11;
  const gap = 4;
  const top = 42;
  const left = 18;
  const dark = theme === "dark";
  const text = dark ? "#c9d1d9" : "#24292f";
  const muted = dark ? "#8b949e" : "#57606a";
  const colors = dark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  const accent = dark ? "#a855f7" : "#7c3aed";
  const totalContributions = cells.reduce((sum, day) => sum + day.count, 0);
  const activeCells = cells.filter((day) => day.level > 0);
  const activeDateSet = new Set(activeCells.map((day) => day.date));
  const duration = Math.max(4, activeCells.length || 4);
  const maxWeek = Math.max(...cells.map((day) => day.week));
  const width = left * 2 + (maxWeek + 1) * (cell + gap);
  const height = 172;

  const rects = cells
    .map((day) => {
      const x = left + day.week * (cell + gap);
      const y = top + day.weekday * (cell + gap);
      const isActive = activeDateSet.has(day.date);
      const activeIndex = isActive ? activeCells.findIndex((activeDay) => activeDay.date === day.date) : -1;
      const activeClass = isActive ? ` class="active active-${activeIndex}"` : "";
      return [
        `<rect${activeClass} x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${colors[day.level]}">`,
        `<title>${escapeXml(day.date)}: ${day.count} contribution${day.count === 1 ? "" : "s"}</title>`,
        "</rect>",
      ].join("");
    })
    .join("\n  ");

  const pulseCss = activeCells
    .map((_, index) => `.active-${index} { animation-delay: ${(index * duration) / Math.max(activeCells.length, 1)}s; }`)
    .join("\n    ");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${year} GitHub contribution snake for ${escapeXml(userName)}</title>
  <desc id="desc">A snake-style animation generated from GitHub's own contribution graph endpoint for ${escapeXml(userName)}, from ${firstDay} through ${today}.</desc>
  <style>
    .active {
      stroke: ${accent};
      stroke-width: 1.5;
      transform-box: fill-box;
      transform-origin: center;
      animation: pulse ${duration}s ease-in-out infinite;
    }
    ${pulseCss}
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      10% { opacity: 1; transform: scale(0.82); }
      20% { opacity: 1; transform: scale(1); }
    }
  </style>
  <text x="${left}" y="17" fill="${text}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">${year} GitHub contribution snake</text>
  <text x="${left}" y="33" fill="${muted}" font-family="Segoe UI, Arial, sans-serif" font-size="11">${totalContributions} contributions from Jan 1 to today, ${activeCells.length} active day${activeCells.length === 1 ? "" : "s"}</text>
  ${rects}
</svg>
`;
}

async function main() {
  const cells = await fetchGitHubCalendar();
  const dist = path.join(process.cwd(), "dist");
  await fs.mkdir(dist, { recursive: true });
  await fs.writeFile(path.join(dist, "github-snake.svg"), makeSvg(cells, "light"));
  await fs.writeFile(path.join(dist, "github-snake-dark.svg"), makeSvg(cells, "dark"));
  console.log(`Generated ${year} snake SVGs for ${userName} from ${sourceUrl}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
