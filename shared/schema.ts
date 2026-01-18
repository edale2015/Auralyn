import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Physicians (users who can approve cases)
export const physicians = pgTable("physicians", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPhysicianSchema = createInsertSchema(physicians).omit({
  id: true,
  createdAt: true,
});

export type InsertPhysician = z.infer<typeof insertPhysicianSchema>;
export type Physician = typeof physicians.$inferSelect;

// Patients (from WhatsApp)
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

// Encounters (medical cases)
export const encounters = pgTable("encounters", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  chiefComplaint: text("chief_complaint"),
  conversationHistory: text("conversation_history"), // JSON string of WhatsApp messages
  aiDiagnosis: text("ai_diagnosis"),
  aiDisposition: text("ai_disposition"),
  aiConfidence: integer("ai_confidence"), // 0-100
  status: text("status").notNull().default("gathering_info"), // gathering_info, pending_review, approved, rejected
  urgencyLevel: text("urgency_level").default("routine"), // routine, urgent, emergent
  physicianId: integer("physician_id").references(() => physicians.id),
  physicianDiagnosis: text("physician_diagnosis"),
  physicianDisposition: text("physician_disposition"),
  physicianNotes: text("physician_notes"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEncounterSchema = createInsertSchema(encounters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertEncounter = z.infer<typeof insertEncounterSchema>;
export type Encounter = typeof encounters.$inferSelect;

// Orders (prescriptions, referrals, labs, etc.)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  encounterId: integer("encounter_id").notNull().references(() => encounters.id),
  orderType: text("order_type").notNull(), // prescription, lab, imaging, referral
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  aiGenerated: boolean("ai_generated").default(true),
  physicianApproved: boolean("physician_approved").default(false),
  physicianId: integer("physician_id").references(() => physicians.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// WhatsApp Messages Log
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  encounterId: integer("encounter_id").references(() => encounters.id),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  direction: text("direction").notNull(), // inbound, outbound
  messageBody: text("message_body").notNull(),
  messageSid: text("message_sid"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;

// Legacy users table for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Re-export chat models for OpenAI integration
export * from "./models/chat";
