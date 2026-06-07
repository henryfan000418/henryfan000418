const fs = require("node:fs/promises");
const path = require("node:path");

const token = process.env.GITHUB_TOKEN;
const userName = process.env.GITHUB_USER_NAME || "henryfan000418";

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

const now = new Date();
const year = now.getUTCFullYear();
const from = `${year}-01-01T00:00:00Z`;
const to = now.toISOString();
const firstDay = `${year}-01-01`;
const today = to.slice(0, 10);

const query = `
  query CurrentYearContributions($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              weekday
            }
          }
        }
      }
    }
  }
`;

async function fetchCalendar() {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "current-year-snake-generator",
    },
    body: JSON.stringify({
      query,
      variables: {
        login: userName,
        from,
        to,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(JSON.stringify(payload.errors, null, 2));
  }

  return payload.data.user.contributionsCollection.contributionCalendar;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countLevel(count) {
  if (count === 0) return 0;
  if (count < 2) return 1;
  if (count < 4) return 2;
  if (count < 7) return 3;
  return 4;
}

function makeSvg(calendar, theme) {
  const cell = 11;
  const gap = 4;
  const top = 42;
  const left = 18;
  const width = left * 2 + calendar.weeks.length * (cell + gap);
  const height = 172;
  const dark = theme === "dark";
  const background = "transparent";
  const text = dark ? "#c9d1d9" : "#24292f";
  const muted = dark ? "#8b949e" : "#57606a";
  const empty = dark ? "#161b22" : "#ebedf0";
  const colors = dark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  const snake = dark ? "#a855f7" : "#7c3aed";

  const days = [];
  calendar.weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      if (day.date >= firstDay && day.date <= today) {
        days.push({
          ...day,
          x: left + weekIndex * (cell + gap),
          y: top + day.weekday * (cell + gap),
        });
      }
    });
  });

  const activeDays = days.filter((day) => day.contributionCount > 0);
  const activeDateSet = new Set(activeDays.map((day) => day.date));
  const duration = Math.max(4, activeDays.length || 4);

  const rects = days
    .map((day) => {
      const level = countLevel(day.contributionCount);
      const fill = level === 0 ? empty : colors[level];
      const isActive = activeDateSet.has(day.date);
      const activeIndex = isActive ? activeDays.findIndex((activeDay) => activeDay.date === day.date) : -1;
      const activeClass = isActive ? ` class="active active-${activeIndex}"` : "";
      return [
        `<rect${activeClass} x="${day.x}" y="${day.y}" width="${cell}" height="${cell}" rx="2" fill="${fill}">`,
        `<title>${escapeXml(day.date)}: ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}</title>`,
        "</rect>",
      ].join("");
    })
    .join("\n  ");

  const pulseCss = activeDays
    .map((_, index) => `.active-${index} { animation-delay: ${(index * duration) / Math.max(activeDays.length, 1)}s; }`)
    .join("\n    ");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${year} GitHub contribution snake for ${escapeXml(userName)}</title>
  <desc id="desc">A snake-style animation generated from ${escapeXml(userName)}'s GitHub contribution calendar from January 1, ${year} through today. Each visible contribution point matches GitHub's current-year contribution graph data.</desc>
  <style>
    .active {
      stroke: ${snake};
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
  <rect width="100%" height="100%" fill="${background}" />
  <text x="${left}" y="17" fill="${text}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">${year} GitHub contribution snake</text>
  <text x="${left}" y="33" fill="${muted}" font-family="Segoe UI, Arial, sans-serif" font-size="11">${calendar.totalContributions} contributions from Jan 1 to today</text>
  ${rects}
</svg>
`;
}

async function main() {
  const calendar = await fetchCalendar();
  const dist = path.join(process.cwd(), "dist");
  await fs.mkdir(dist, { recursive: true });
  await fs.writeFile(path.join(dist, "github-snake.svg"), makeSvg(calendar, "light"));
  await fs.writeFile(path.join(dist, "github-snake-dark.svg"), makeSvg(calendar, "dark"));
  console.log(`Generated ${year} snake SVGs for ${userName}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
