import { db } from "../db";
import { sql } from "drizzle-orm";
import { sendSMS } from "../services/smsService";

export interface PatientLocation {
  lat: number;
  lon: number;
}

export interface HospitalRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  services: string[];
  is_active: boolean;
  dist?: number;
}

export interface EMSUnit {
  id: string;
  unit_name: string;
  lat: number;
  lon: number;
  status: string;
  eta?: number;
}

function haversineKm(a: PatientLocation, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export async function selectHospital(
  patientLocation: PatientLocation,
  neededService: string
): Promise<(HospitalRow & { dist: number }) | null> {
  try {
    const result = await db.execute(sql`
      SELECT id, name, lat, lon, services, is_active
      FROM kb_hospitals
      WHERE is_active = TRUE
    `);
    const hospitals = (result.rows ?? result) as HospitalRow[];

    const candidates = hospitals
      .filter(h => {
        const svc = Array.isArray(h.services) ? h.services : [];
        return neededService === "any" || svc.includes(neededService);
      })
      .map(h => ({ ...h, dist: haversineKm(patientLocation, h) }))
      .sort((a, b) => a.dist - b.dist);

    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

export async function computeETA(
  unit: { lat: number; lon: number },
  patient: PatientLocation,
  avgSpeedKmh = 60
): Promise<number> {
  const dist = haversineKm(patient, unit);
  return Math.round((dist / avgSpeedKmh) * 60); // minutes
}

export async function seedHospitals(): Promise<number> {
  const hospitals = [
    { name: "Bay General Hospital",       lat: 37.774, lon: -122.419, services: ["ICU","cardiology","trauma","emergency"] },
    { name: "Mission Medical Center",     lat: 37.762, lon: -122.430, services: ["ICU","neurology","emergency"] },
    { name: "Sunset Community Hospital",  lat: 37.758, lon: -122.454, services: ["emergency","pediatrics","orthopedics"] },
    { name: "Pacific Heights Clinic",     lat: 37.793, lon: -122.440, services: ["outpatient","cardiology","neurology"] },
    { name: "Harbor View Trauma Center",  lat: 37.781, lon: -122.393, services: ["trauma","ICU","emergency","burns"] },
    { name: "Richmond ENT Specialty",     lat: 37.779, lon: -122.464, services: ["ENT","outpatient","audiology"] },
  ];

  let seeded = 0;
  for (const h of hospitals) {
    const servicesLit = `'{${h.services.join(",")}}'`;
    await db.execute(sql`
      INSERT INTO kb_hospitals (name, lat, lon, services, is_active)
      VALUES (${h.name}, ${h.lat}, ${h.lon}, ${sql.raw(servicesLit)}::text[], TRUE)
      ON CONFLICT DO NOTHING
    `);
    seeded++;
  }
  return seeded;
}

export async function seedEmsUnits(): Promise<number> {
  const units = [
    { unit_name: "EMS-01", lat: 37.780, lon: -122.415, status: "available" },
    { unit_name: "EMS-02", lat: 37.765, lon: -122.445, status: "available" },
    { unit_name: "EMS-03", lat: 37.790, lon: -122.430, status: "dispatched" },
    { unit_name: "EMS-04", lat: 37.757, lon: -122.406, status: "available" },
  ];

  let seeded = 0;
  for (const u of units) {
    await db.execute(sql`
      INSERT INTO ems_units (unit_name, lat, lon, status)
      VALUES (${u.unit_name}, ${u.lat}, ${u.lon}, ${u.status})
      ON CONFLICT DO NOTHING
    `);
    seeded++;
  }
  return seeded;
}

export async function sendPhysicianAlert(
  patientId: string,
  physicianName: string,
  physicianPhone: string,
  message: string
): Promise<{ ok: boolean; sid?: string }> {
  // Log alert
  await db.execute(sql`
    INSERT INTO physician_alerts (patient_id, physician_name, physician_phone, message, status)
    VALUES (${patientId}, ${physicianName}, ${physicianPhone}, ${message}, 'sending')
  `);

  // Send SMS
  const result = await sendSMS(physicianPhone, message);

  // Update status
  await db.execute(sql`
    UPDATE physician_alerts
    SET status = ${result.success ? "sent" : "failed"}
    WHERE patient_id = ${patientId}
      AND physician_name = ${physicianName}
      AND created_at = (SELECT MAX(created_at) FROM physician_alerts WHERE patient_id = ${patientId})
  `);

  return { ok: result.success, sid: result.sid };
}
