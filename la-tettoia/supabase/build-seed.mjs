import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
runInNewContext(readFileSync(join(directory, "../js/menu-data.js"), "utf8"), sandbox);
const menu = JSON.stringify(sandbox.window.MENU);
if (!menu || menu.includes("$menu$")) throw new Error("Invalid menu data");
writeFileSync(join(directory, "seed-menu.sql"),
  `-- Initial menu. Existing manager edits are preserved.\n` +
  `insert into public.site_menu (id, content) values (1, $menu$${menu}$menu$::jsonb)\n` +
  `on conflict (id) do nothing;\n`);
