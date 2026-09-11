import { db } from "./db";
import { DEFAULT_RULES, type Rule } from "./analysis";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * User corrections take priority over the built-in rules — that's the whole
 * point of the correction loop (see CLAUDE.md). `pattern` is a plain
 * substring of the normalised merchant, not a regex the user has to write.
 */
export async function getRules(): Promise<Rule[]> {
  const { rows } = await db.query(
    `select pattern, mcc, category from category_rule order by priority asc, id asc`,
  );
  const custom: Rule[] = rows.map((r) => ({
    category: r.category,
    mcc: r.mcc ? [r.mcc] : undefined,
    match: new RegExp(escapeRegExp(r.pattern)),
  }));
  return [...custom, ...DEFAULT_RULES];
}
