import { db } from "../../server/db";
import { sql } from "drizzle-orm";
(async () => {
  try {
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM kb_master_rules WHERE active = true`);
    console.log("active rules total:", (r.rows?.[0] as any)?.n);
    const cp = await db.execute(sql`
      SELECT count(*)::int AS n FROM kb_master_rules
      WHERE active = true AND (complaint_id = 'chest_pain' OR complaint_id = 'ALL' OR complaint_id ILIKE '%chest_pain%')`);
    console.log("rules visible to chest_pain pipeline:", (cp.rows?.[0] as any)?.n);
    const types = await db.execute(sql`
      SELECT rule_type, count(*)::int AS n FROM kb_master_rules
      WHERE active = true AND (complaint_id = 'chest_pain' OR complaint_id = 'ALL' OR complaint_id ILIKE '%chest_pain%')
      GROUP BY rule_type ORDER BY 1`);
    console.log("by rule_type:", JSON.stringify(types.rows));
  } catch (e:any) {
    console.error("DB ERROR:", e?.message);
  }
  process.exit(0);
})();
