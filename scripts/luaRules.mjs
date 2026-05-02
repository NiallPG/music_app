import fs from "node:fs";

function parseScalar(value) {
  const trimmed = value.trim().replace(/,$/, "");

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  throw new Error(`Unsupported Lua value: ${value}`);
}

function parseObject(block) {
  const object = {};
  const assignmentPattern = /(\w+)\s*=\s*("[^"]*"|-?\d+(?:\.\d+)?|true|false)\s*,?/g;
  let match;

  while ((match = assignmentPattern.exec(block)) !== null) {
    object[match[1]] = parseScalar(match[2]);
  }

  return object;
}

export function loadListeningRules(filePath) {
  const lua = fs.readFileSync(filePath, "utf8");
  const rulesBlock = lua.match(/rules\s*=\s*\{([\s\S]*)\}\s*\}\s*$/);

  if (!rulesBlock) {
    throw new Error("Lua rules file must return a table with a rules array.");
  }

  const header = lua.slice(0, rulesBlock.index);
  const rules = [...rulesBlock[1].matchAll(/\{\s*([\s\S]*?)\s*\}\s*,?/g)].map(
    (match) => parseObject(match[1])
  );

  const config = parseObject(header);
  config.rules = rules;

  validateRules(config);
  return config;
}

export function validateRules(config) {
  if (!config.plan_name || typeof config.plan_name !== "string") {
    throw new Error("Lua rules must include a plan_name string.");
  }

  if (!Number.isInteger(config.max_items) || config.max_items < 1) {
    throw new Error("Lua rules must include max_items as a positive integer.");
  }

  if (!Array.isArray(config.rules) || config.rules.length === 0) {
    throw new Error("Lua rules must include at least one scoring rule.");
  }

  for (const rule of config.rules) {
    if (!rule.key || !rule.label || typeof rule.points !== "number") {
      throw new Error("Every Lua rule needs key, label, and numeric points.");
    }
  }
}

export function scoreAlbums(albums, config) {
  return albums
    .map((album) => {
      const year = Number(String(album.release_date ?? "").slice(0, 4)) || 0;
      const appliedRules = config.rules.filter((rule) => {
        if (rule.album_type && rule.album_type !== album.album_type) return false;
        if (rule.min_year && year < rule.min_year) return false;
        if (rule.max_year && year > rule.max_year) return false;
        return true;
      });

      const score = appliedRules.reduce((total, rule) => total + rule.points, 0);

      return {
        id: album.id,
        name: album.name,
        album_type: album.album_type,
        release_date: album.release_date,
        image: album.images?.[0]?.url ?? null,
        score,
        reasons: appliedRules.map((rule) => rule.label),
      };
    })
    .sort((a, b) => b.score - a.score || String(b.release_date).localeCompare(String(a.release_date)))
    .slice(0, config.max_items);
}
