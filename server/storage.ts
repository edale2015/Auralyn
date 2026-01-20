import { 
  type Physician, type InsertPhysician,
  type Patient, type InsertPatient,
  type Encounter, type InsertEncounter,
  type Order, type InsertOrder,
  type WhatsappMessage, type InsertWhatsappMessage,
  physicians, patients, encounters, orders, whatsappMessages,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or } from "drizzle-orm";

export interface IStorage {
  // Physicians
  getPhysician(id: number): Promise<Physician | undefined>;
  getPhysicianByUsername(username: string): Promise<Physician | undefined>;
  createPhysician(physician: InsertPhysician): Promise<Physician>;
  
  // Patients
  getPatient(id: number): Promise<Patient | undefined>;
  getPatientByPhone(phoneNumber: string): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  
  // Encounters
  getEncounter(id: number): Promise<Encounter | undefined>;
  getEncounterWithDetails(id: number): Promise<(Encounter & { messages?: WhatsappMessage[], orders?: Order[] }) | undefined>;
  getEncountersByStatus(status?: string): Promise<Encounter[]>;
  getActiveEncounterByPatient(patientId: number): Promise<Encounter | undefined>;
  createEncounter(encounter: InsertEncounter): Promise<Encounter>;
  updateEncounter(id: number, updates: Partial<Encounter>): Promise<Encounter | undefined>;
  
  // Orders
  getOrdersByEncounter(encounterId: number): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: number, updates: Partial<Order>): Promise<Order | undefined>;
  
  // WhatsApp Messages
  getMessagesByEncounter(encounterId: number): Promise<WhatsappMessage[]>;
  getMessagesByPatient(patientId: number): Promise<WhatsappMessage[]>;
  createMessage(message: InsertWhatsappMessage): Promise<WhatsappMessage>;
}

export class MemStorage implements IStorage {
  private physicians: Map<number, Physician> = new Map();
  private patients: Map<number, Patient> = new Map();
  private encounters: Map<number, Encounter> = new Map();
  private orders: Map<number, Order> = new Map();
  private whatsappMessages: Map<number, WhatsappMessage> = new Map();
  
  private physicianIdCounter = 1;
  private patientIdCounter = 1;
  private encounterIdCounter = 1;
  private orderIdCounter = 1;
  private messageIdCounter = 1;

  constructor() {
    // Create default physician using environment variable for password
    const mdPassword = process.env.MD_PASSWORD || "physician123";
    this.createPhysician({
      username: "admin",
      password: mdPassword,
      name: "Dr. Smith",
      specialty: "Internal Medicine",
    });
  }

  // Physicians
  async getPhysician(id: number): Promise<Physician | undefined> {
    return this.physicians.get(id);
  }

  async getPhysicianByUsername(username: string): Promise<Physician | undefined> {
    return Array.from(this.physicians.values()).find(p => p.username === username);
  }

  async createPhysician(physician: InsertPhysician): Promise<Physician> {
    const id = this.physicianIdCounter++;
    const newPhysician: Physician = {
      ...physician,
      id,
      specialty: physician.specialty || null,
      createdAt: new Date(),
    };
    this.physicians.set(id, newPhysician);
    return newPhysician;
  }

  // Patients
  async getPatient(id: number): Promise<Patient | undefined> {
    return this.patients.get(id);
  }

  async getPatientByPhone(phoneNumber: string): Promise<Patient | undefined> {
    return Array.from(this.patients.values()).find(p => p.phoneNumber === phoneNumber);
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const id = this.patientIdCounter++;
    const newPatient: Patient = {
      ...patient,
      id,
      name: patient.name || null,
      createdAt: new Date(),
    };
    this.patients.set(id, newPatient);
    return newPatient;
  }

  // Encounters
  async getEncounter(id: number): Promise<Encounter | undefined> {
    return this.encounters.get(id);
  }

  async getEncounterWithDetails(id: number): Promise<(Encounter & { messages?: WhatsappMessage[], orders?: Order[] }) | undefined> {
    const encounter = this.encounters.get(id);
    if (!encounter) return undefined;
    
    const messages = await this.getMessagesByEncounter(id);
    const orders = await this.getOrdersByEncounter(id);
    
    return { ...encounter, messages, orders };
  }

  async getEncountersByStatus(status?: string): Promise<Encounter[]> {
    const all = Array.from(this.encounters.values());
    if (!status || status === "all") {
      return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return all
      .filter(e => e.status === status)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getActiveEncounterByPatient(patientId: number): Promise<Encounter | undefined> {
    return Array.from(this.encounters.values()).find(
      e => e.patientId === patientId && (e.status === "gathering_info" || e.status === "in_progress" || e.status === "pending_review")
    );
  }

  async createEncounter(encounter: InsertEncounter): Promise<Encounter> {
    const id = this.encounterIdCounter++;
    const now = new Date();
    const newEncounter: Encounter = {
      id,
      patientId: encounter.patientId,
      chiefComplaint: encounter.chiefComplaint || null,
      conversationHistory: encounter.conversationHistory || null,
      aiDiagnosis: encounter.aiDiagnosis || null,
      aiDisposition: encounter.aiDisposition || null,
      aiConfidence: encounter.aiConfidence || null,
      status: encounter.status || "gathering_info",
      urgencyLevel: encounter.urgencyLevel || "routine",
      physicianId: encounter.physicianId || null,
      physicianDiagnosis: encounter.physicianDiagnosis || null,
      physicianDisposition: encounter.physicianDisposition || null,
      physicianNotes: encounter.physicianNotes || null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
      // ENT flow fields
      system: encounter.system || null,
      complaint: encounter.complaint || null,
      specialty: encounter.specialty || null,
      flowId: encounter.flowId || null,
      flowIndex: encounter.flowIndex ?? 0,
      answers: encounter.answers || null,
      proposal: encounter.proposal || null,
      physicianSummary: encounter.physicianSummary || null,
    };
    this.encounters.set(id, newEncounter);
    return newEncounter;
  }

  async updateEncounter(id: number, updates: Partial<Encounter>): Promise<Encounter | undefined> {
    const encounter = this.encounters.get(id);
    if (!encounter) return undefined;
    
    const updated: Encounter = {
      ...encounter,
      ...updates,
      updatedAt: new Date(),
    };
    this.encounters.set(id, updated);
    return updated;
  }

  // Orders
  async getOrdersByEncounter(encounterId: number): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter(o => o.encounterId === encounterId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const id = this.orderIdCounter++;
    const newOrder: Order = {
      id,
      encounterId: order.encounterId,
      orderType: order.orderType,
      description: order.description,
      status: order.status || "pending",
      aiGenerated: order.aiGenerated ?? true,
      physicianApproved: order.physicianApproved ?? false,
      physicianId: order.physicianId || null,
      approvedAt: null,
      createdAt: new Date(),
    };
    this.orders.set(id, newOrder);
    return newOrder;
  }

  async updateOrder(id: number, updates: Partial<Order>): Promise<Order | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const updated: Order = { ...order, ...updates };
    this.orders.set(id, updated);
    return updated;
  }

  // WhatsApp Messages
  async getMessagesByEncounter(encounterId: number): Promise<WhatsappMessage[]> {
    return Array.from(this.whatsappMessages.values())
      .filter(m => m.encounterId === encounterId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getMessagesByPatient(patientId: number): Promise<WhatsappMessage[]> {
    return Array.from(this.whatsappMessages.values())
      .filter(m => m.patientId === patientId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createMessage(message: InsertWhatsappMessage): Promise<WhatsappMessage> {
    const id = this.messageIdCounter++;
    const newMessage: WhatsappMessage = {
      id,
      encounterId: message.encounterId || null,
      patientId: message.patientId,
      direction: message.direction,
      messageBody: message.messageBody,
      messageSid: message.messageSid || null,
      createdAt: new Date(),
    };
    this.whatsappMessages.set(id, newMessage);
    return newMessage;
  }
}

export class DatabaseStorage implements IStorage {
  
  constructor() {
    this.initDefaultPhysician();
  }

  private async initDefaultPhysician() {
    const existing = await this.getPhysicianByUsername("admin");
    if (!existing) {
      const mdPassword = process.env.MD_PASSWORD || "physician123";
      await this.createPhysician({
        username: "admin",
        password: mdPassword,
        name: "Dr. Smith",
        specialty: "Internal Medicine",
      });
    }
  }

  async getPhysician(id: number): Promise<Physician | undefined> {
    const result = await db.select().from(physicians).where(eq(physicians.id, id));
    return result[0];
  }

  async getPhysicianByUsername(username: string): Promise<Physician | undefined> {
    const result = await db.select().from(physicians).where(eq(physicians.username, username));
    return result[0];
  }

  async createPhysician(physician: InsertPhysician): Promise<Physician> {
    const result = await db.insert(physicians).values(physician).returning();
    return result[0];
  }

  async getPatient(id: number): Promise<Patient | undefined> {
    const result = await db.select().from(patients).where(eq(patients.id, id));
    return result[0];
  }

  async getPatientByPhone(phoneNumber: string): Promise<Patient | undefined> {
    const result = await db.select().from(patients).where(eq(patients.phoneNumber, phoneNumber));
    return result[0];
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const result = await db.insert(patients).values(patient).returning();
    return result[0];
  }

  async getEncounter(id: number): Promise<Encounter | undefined> {
    const result = await db.select().from(encounters).where(eq(encounters.id, id));
    return result[0];
  }

  async getEncounterWithDetails(id: number): Promise<(Encounter & { messages?: WhatsappMessage[], orders?: Order[] }) | undefined> {
    const encounter = await this.getEncounter(id);
    if (!encounter) return undefined;
    
    const messages = await this.getMessagesByEncounter(id);
    const ordersList = await this.getOrdersByEncounter(id);
    
    return { ...encounter, messages, orders: ordersList };
  }

  async getEncountersByStatus(status?: string): Promise<Encounter[]> {
    if (!status || status === "all") {
      return await db.select().from(encounters).orderBy(desc(encounters.createdAt));
    }
    return await db.select().from(encounters)
      .where(eq(encounters.status, status))
      .orderBy(desc(encounters.createdAt));
  }

  async getActiveEncounterByPatient(patientId: number): Promise<Encounter | undefined> {
    const result = await db.select().from(encounters)
      .where(and(
        eq(encounters.patientId, patientId),
        or(
          eq(encounters.status, "gathering_info"),
          eq(encounters.status, "in_progress"),
          eq(encounters.status, "pending_review")
        )
      ));
    return result[0];
  }

  async createEncounter(encounter: InsertEncounter): Promise<Encounter> {
    const result = await db.insert(encounters).values({
      ...encounter,
      status: encounter.status || "gathering_info",
      urgencyLevel: encounter.urgencyLevel || "routine",
    }).returning();
    return result[0];
  }

  async updateEncounter(id: number, updates: Partial<Encounter>): Promise<Encounter | undefined> {
    const result = await db.update(encounters)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(encounters.id, id))
      .returning();
    return result[0];
  }

  async getOrdersByEncounter(encounterId: number): Promise<Order[]> {
    return await db.select().from(orders)
      .where(eq(orders.encounterId, encounterId))
      .orderBy(orders.createdAt);
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const result = await db.insert(orders).values({
      ...order,
      status: order.status || "pending",
      aiGenerated: order.aiGenerated ?? true,
      physicianApproved: order.physicianApproved ?? false,
    }).returning();
    return result[0];
  }

  async updateOrder(id: number, updates: Partial<Order>): Promise<Order | undefined> {
    const result = await db.update(orders)
      .set(updates)
      .where(eq(orders.id, id))
      .returning();
    return result[0];
  }

  async getMessagesByEncounter(encounterId: number): Promise<WhatsappMessage[]> {
    return await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.encounterId, encounterId))
      .orderBy(whatsappMessages.createdAt);
  }

  async getMessagesByPatient(patientId: number): Promise<WhatsappMessage[]> {
    return await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.patientId, patientId))
      .orderBy(whatsappMessages.createdAt);
  }

  async createMessage(message: InsertWhatsappMessage): Promise<WhatsappMessage> {
    const result = await db.insert(whatsappMessages).values(message).returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage();
