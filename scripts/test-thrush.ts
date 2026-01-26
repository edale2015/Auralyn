import { getMedicationCatalog } from '../server/meds/medCatalog.js';

async function testThrush() {
  // Simulate patient answers with thrush indicators
  const a: Record<string, any> = {
    SORE_THROAT: true,
    TH_WHITE_WISPS: true,
    TH_STEROIDS_RECENT: true,
  };

  const diagnosis_labels: string[] = [];
  const diagnosis_ids: string[] = [];
  const pushUnique = (arr: string[], v: string) => {
    if (!v || arr.includes(v)) return;
    arr.push(v);
  };

  // Sore throat diagnosis
  if (a.SORE_THROAT) diagnosis_ids.push("ENT_PHARYNGITIS");

  // THRUSH BRANCH (same logic as routes.ts)
  const whiteWisps = !!a.TH_WHITE_WISPS;
  const thrushConcern = !!a.TH_THRUSH_CONCERN;
  const steroidsRecent = !!a.TH_STEROIDS_RECENT;
  const immunocomp = !!a.TH_IMMUNOCOMPROMISED;

  console.log("=== THRUSH INPUT ===");
  console.log("TH_WHITE_WISPS:", whiteWisps);
  console.log("TH_STEROIDS_RECENT:", steroidsRecent);

  if (whiteWisps || thrushConcern) {
    if (steroidsRecent || immunocomp || thrushConcern) {
      pushUnique(diagnosis_labels, "Possible oral thrush");
      diagnosis_ids.push("ENT_ORAL_THRUSH");
      console.log("✓ Thrush branch triggered!");
    }
  }

  // Build clusters
  const DIAGNOSIS_TO_CLUSTER: Record<string, string[]> = {
    "ent_pharyngitis": ["pharyngitis", "sore throat"],
    "ent_oral_thrush": ["oral thrush cluster", "thrush", "candidiasis"],
  };

  const indicationClusters: string[] = [];
  for (const dx of diagnosis_ids) {
    const clusters = DIAGNOSIS_TO_CLUSTER[dx.toLowerCase()] || [];
    for (const c of clusters) {
      if (!indicationClusters.includes(c)) indicationClusters.push(c);
    }
  }

  console.log("\n=== DIAGNOSIS RESULTS ===");
  console.log("diagnosis_ids:", diagnosis_ids);
  console.log("diagnosis_labels:", diagnosis_labels);
  console.log("indicationClusters:", indicationClusters);

  // Load meds and check for thrush treatments
  const catalog = await getMedicationCatalog();
  console.log("\n=== MED CATALOG ===");
  console.log("Cluster keys:", Array.from(catalog.byIndicationCluster.keys()).filter(k => k.includes("thrush")));
  
  const thrushMeds = catalog.byIndicationCluster.get("oral thrush cluster") || [];
  console.log("\nMeds for 'oral thrush cluster':");
  for (const m of thrushMeds) {
    console.log(`  - ${m.name} (FirstLine: ${m.isFirstLine}, Route: ${m.route})`);
  }

  // Validation
  console.log("\n=== VALIDATION ===");
  console.log("✓ diagnosis_labels includes 'Possible oral thrush':", diagnosis_labels.includes("Possible oral thrush"));
  console.log("✓ indicationClusters includes thrush:", indicationClusters.some(c => c.includes("thrush")));
  console.log("✓ Has Nystatin/Clotrimazole:", thrushMeds.some(m => 
    m.name.toLowerCase().includes("nystatin") || m.name.toLowerCase().includes("clotrimazole")
  ));
}

testThrush().catch(console.error);
