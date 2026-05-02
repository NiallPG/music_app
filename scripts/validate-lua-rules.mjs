import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadListeningRules } from "./luaRules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.join(__dirname, "..", "workflows", "listening_rules.lua");
const rules = loadListeningRules(rulesPath);

console.log(
  `Loaded ${rules.rules.length} Lua listening rules for "${rules.plan_name}".`
);
