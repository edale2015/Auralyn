/**
 * seedProtocols.ts
 * Run with: npx tsx server/followup/seedProtocols.ts
 */

import { db }                       from "../db";
import { followUpProtocols }        from "../../shared/followUpSchema";
import { FOLLOW_UP_PROTOCOL_SEEDS } from "./followUpProtocolSeeds";

async function seed() {
  console.log("Seeding follow-up protocols...");
  for (const seed of FOLLOW_UP_PROTOCOL_SEEDS) {
    await db.insert(followUpProtocols).values({
      complaintSlug:        seed.complaintSlug,
      name:                 seed.name,
      scheduleDays:         seed.scheduleDays,
      questions:            seed.questions,
      escalationThreshold:  seed.escalationThreshold,
      active:               true,
    }).onConflictDoNothing();
  }
  console.log(`Seeded ${FOLLOW_UP_PROTOCOL_SEEDS.length} protocols.`);
  process.exit(0);
}

seed().catch(console.error);
