/**
 * Regional Capacity Layer
 *
 * Takes raw facility descriptors and computes a live capacity picture for
 * each site: effective load, available slots, whether the facility can safely
 * accept more patients, and an overall saturation label.
 *
 * The load score is the primary sorting key used by the geo routing engine
 * when selecting the optimal destination for each patient.
 */

export interface FacilityInput {
  name:          string;
  type:          "ER" | "CLINIC" | "TELEMED" | "TRAUMA" | "STROKE" | "CATH";
  distance:      number;          // km from requesting site
  openSlots:     number;
  totalSlots:    number;
  physicianCount: number;
  waitMinutes:   number;
  specialties?:  string[];        // e.g. ["stroke", "trauma", "cardiology"]
}

export interface FacilityCapacity extends FacilityInput {
  loadScore:           number;    // 0–1; higher = more loaded
  saturation:          "low" | "medium" | "high" | "critical";
  canAcceptUrgent:     boolean;
  canAcceptRoutine:    boolean;
  estimatedWaitRating: "fast" | "moderate" | "slow" | "blocked";
}

export function computeRegionalCapacity(facilities: FacilityInput[]): FacilityCapacity[] {
  return facilities.map(f => {
    const slotUtil   = f.totalSlots > 0 ? Math.min(1, 1 - (f.openSlots / f.totalSlots)) : 1;
    const waitFactor = f.waitMinutes > 60 ? 0.2 : f.waitMinutes > 30 ? 0.1 : 0;
    const loadScore  = Math.min(1, slotUtil + waitFactor);

    const saturation: FacilityCapacity["saturation"] =
      loadScore >= 0.9 ? "critical" :
      loadScore >= 0.7 ? "high"     :
      loadScore >= 0.4 ? "medium"   : "low";

    const estimatedWaitRating: FacilityCapacity["estimatedWaitRating"] =
      f.waitMinutes > 90 ? "blocked"  :
      f.waitMinutes > 45 ? "slow"     :
      f.waitMinutes > 20 ? "moderate" : "fast";

    return {
      ...f,
      loadScore,
      saturation,
      canAcceptUrgent:  loadScore < 0.9 && f.physicianCount >= 1,
      canAcceptRoutine: loadScore < 0.7 && f.openSlots > 0,
      estimatedWaitRating,
    };
  });
}
