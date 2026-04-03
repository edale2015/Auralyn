import { runFullKbMigration } from "../kb/migration/fullKbMigration";

async function main() {
  const result = await runFullKbMigration();
  console.log("Migration complete:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
