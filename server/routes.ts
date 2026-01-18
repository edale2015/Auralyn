import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import twilio from "twilio";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+18778370984";

// System prompt for the medical AI assistant
const MEDICAL_AI_SYSTEM_PROMPT = `You are a medical triage assistant helping gather patient information through WhatsApp. Your job is to:

1. Greet the patient warmly and ask about their chief complaint
2. Ask focused follow-up questions ONE AT A TIME to understand their symptoms
3. Keep questions simple and clear - patients are not medical professionals
4. After gathering sufficient information (usually 3-5 questions), provide a summary

When you have enough information, respond with a JSON summary in this format:
{"complete": true, "chiefComplaint": "brief description", "diagnosis": "likely condition", "disposition": "recommendation", "urgency": "routine|urgent|emergent", "confidence": 0-100}

Until you have enough info, just respond conversationally to gather more details. Always be empathetic and professional.

Important symptoms that indicate urgency:
- Chest pain, difficulty breathing, severe bleeding = emergent
- High fever, severe pain, concerning symptoms = urgent
- Mild symptoms, chronic issues = routine`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Increase body limit for potential audio payloads
  app.use((req, res, next) => {
    if (req.headers['content-type']?.includes('application/json')) {
      // Already handled by express.json()
    }
    next();
  });

  // Auth routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      const physician = await storage.getPhysicianByUsername(username);
      if (!physician) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Simple password check (in production, use proper hashing)
      if (physician.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Don't send password back
      const { password: _, ...safePhysician } = physician;
      res.json(safePhysician);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Encounters API
  app.get("/api/encounters", async (req: Request, res: Response) => {
    try {
      const filterParam = req.query.filter;
      const filter = typeof filterParam === "string" ? filterParam : undefined;
      let status: string | undefined;
      
      if (filter === "pending") status = "pending_review";
      else if (filter === "approved") status = "approved";
      
      const encounters = await storage.getEncountersByStatus(status);
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/:id", async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const encounter = await storage.getEncounterWithDetails(id);
      
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      
      res.json(encounter);
    } catch (error) {
      console.error("Error fetching encounter:", error);
      res.status(500).json({ error: "Failed to fetch encounter" });
    }
  });

  app.post("/api/encounters/:id/approve", async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const { physicianId, physicianDiagnosis, physicianDisposition, physicianNotes } = req.body;
      
      const encounter = await storage.updateEncounter(id, {
        status: "approved",
        physicianId,
        physicianDiagnosis,
        physicianDisposition,
        physicianNotes,
        approvedAt: new Date(),
      });
      
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      
      // Approve all pending orders for this encounter
      const orders = await storage.getOrdersByEncounter(id);
      for (const order of orders) {
        if (!order.physicianApproved) {
          await storage.updateOrder(order.id, {
            physicianApproved: true,
            physicianId,
            status: "approved",
            approvedAt: new Date(),
          });
        }
      }
      
      // Send confirmation message to patient via WhatsApp
      const patient = await storage.getPatient(encounter.patientId);
      if (patient) {
        const message = `Your case has been reviewed by a physician. Disposition: ${physicianDisposition}. ${physicianNotes ? `Notes: ${physicianNotes}` : ""} Please follow up as directed.`;
        
        try {
          await sendWhatsAppMessage(patient.phoneNumber, message);
          await storage.createMessage({
            patientId: patient.id,
            encounterId: id,
            direction: "outbound",
            messageBody: message,
          });
        } catch (twilioError) {
          console.error("Failed to send WhatsApp message:", twilioError);
          // Don't fail the approval if WhatsApp fails
        }
      }
      
      res.json(encounter);
    } catch (error) {
      console.error("Error approving encounter:", error);
      res.status(500).json({ error: "Failed to approve encounter" });
    }
  });

  app.post("/api/encounters/:id/request-info", async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const encounter = await storage.getEncounter(id);
      
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      
      const patient = await storage.getPatient(encounter.patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const message = "The physician reviewing your case needs additional information. Can you provide more details about your symptoms?";
      
      try {
        await sendWhatsAppMessage(patient.phoneNumber, message);
        await storage.createMessage({
          patientId: patient.id,
          encounterId: id,
          direction: "outbound",
          messageBody: message,
        });
      } catch (twilioError) {
        console.error("Failed to send WhatsApp message:", twilioError);
        return res.status(500).json({ error: "Failed to send message to patient" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error requesting info:", error);
      res.status(500).json({ error: "Failed to request info" });
    }
  });

  // Twilio WhatsApp Webhook
  app.post("/api/webhooks/whatsapp", async (req: Request, res: Response) => {
    try {
      const { From, Body, MessageSid } = req.body;
      const phoneNumber = From; // Format: whatsapp:+1234567890
      
      console.log(`Received WhatsApp message from ${phoneNumber}: ${Body}`);
      
      // Get or create patient
      let patient = await storage.getPatientByPhone(phoneNumber);
      if (!patient) {
        patient = await storage.createPatient({
          phoneNumber,
          name: null,
        });
      }
      
      // Get or create active encounter
      let encounter = await storage.getActiveEncounterByPatient(patient.id);
      if (!encounter) {
        encounter = await storage.createEncounter({
          patientId: patient.id,
          status: "gathering_info",
        });
      }
      
      // Save incoming message
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "inbound",
        messageBody: Body,
        messageSid: MessageSid,
      });
      
      // Get conversation history for context
      const messages = await storage.getMessagesByEncounter(encounter.id);
      const conversationHistory = messages.map(m => ({
        role: m.direction === "inbound" ? "user" : "assistant" as const,
        content: m.messageBody,
      }));
      
      // Get AI response
      const aiResponse = await getAIResponse(conversationHistory, Body);
      
      // Check if AI thinks we have enough info
      let aiResult = null;
      try {
        // Try to parse as JSON (complete assessment)
        if (aiResponse.includes('"complete": true') || aiResponse.includes('"complete":true')) {
          const jsonMatch = aiResponse.match(/\{[\s\S]*"complete"[\s\S]*\}/);
          if (jsonMatch) {
            aiResult = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (parseError) {
        // Not a complete assessment yet, continue conversation
      }
      
      let responseMessage: string;
      
      if (aiResult && aiResult.complete) {
        // Update encounter with AI assessment
        await storage.updateEncounter(encounter.id, {
          chiefComplaint: aiResult.chiefComplaint,
          aiDiagnosis: aiResult.diagnosis,
          aiDisposition: aiResult.disposition,
          urgencyLevel: aiResult.urgency || "routine",
          aiConfidence: aiResult.confidence || 70,
          status: "pending_review",
        });
        
        // Create suggested orders based on disposition
        if (aiResult.disposition) {
          await storage.createOrder({
            encounterId: encounter.id,
            orderType: "referral",
            description: `Suggested: ${aiResult.disposition}`,
            aiGenerated: true,
          });
        }
        
        responseMessage = `Thank you for the information. I've gathered your symptoms and a physician will review your case shortly. Based on the initial assessment:\n\nChief Complaint: ${aiResult.chiefComplaint}\nRecommendation: ${aiResult.disposition}\n\nA physician will confirm this and provide further instructions.`;
      } else {
        // Continue conversation
        responseMessage = aiResponse;
      }
      
      // Save and send response
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "outbound",
        messageBody: responseMessage,
      });
      
      try {
        await sendWhatsAppMessage(phoneNumber, responseMessage);
      } catch (twilioError) {
        console.error("Failed to send WhatsApp response:", twilioError);
      }
      
      // Respond to Twilio webhook
      res.set("Content-Type", "text/xml");
      res.send("<Response></Response>");
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      res.set("Content-Type", "text/xml");
      res.send("<Response></Response>");
    }
  });

  // Test endpoint to simulate WhatsApp message
  app.post("/api/test/simulate-message", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, message } = req.body;
      
      // Simulate the webhook request
      const fakeFrom = phoneNumber.startsWith("whatsapp:") ? phoneNumber : `whatsapp:${phoneNumber}`;
      
      // Get or create patient
      let patient = await storage.getPatientByPhone(fakeFrom);
      if (!patient) {
        patient = await storage.createPatient({
          phoneNumber: fakeFrom,
          name: null,
        });
      }
      
      // Get or create active encounter
      let encounter = await storage.getActiveEncounterByPatient(patient.id);
      if (!encounter) {
        encounter = await storage.createEncounter({
          patientId: patient.id,
          status: "gathering_info",
        });
      }
      
      // Save incoming message
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "inbound",
        messageBody: message,
      });
      
      // Get conversation history
      const messages = await storage.getMessagesByEncounter(encounter.id);
      const conversationHistory = messages.map(m => ({
        role: m.direction === "inbound" ? "user" : "assistant" as const,
        content: m.messageBody,
      }));
      
      // Get AI response
      const aiResponse = await getAIResponse(conversationHistory, message);
      
      // Check for complete assessment
      let aiResult = null;
      try {
        if (aiResponse.includes('"complete": true') || aiResponse.includes('"complete":true')) {
          const jsonMatch = aiResponse.match(/\{[\s\S]*"complete"[\s\S]*\}/);
          if (jsonMatch) {
            aiResult = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (parseError) {
        // Continue
      }
      
      let responseMessage: string;
      
      if (aiResult && aiResult.complete) {
        await storage.updateEncounter(encounter.id, {
          chiefComplaint: aiResult.chiefComplaint,
          aiDiagnosis: aiResult.diagnosis,
          aiDisposition: aiResult.disposition,
          urgencyLevel: aiResult.urgency || "routine",
          aiConfidence: aiResult.confidence || 70,
          status: "pending_review",
        });
        
        if (aiResult.disposition) {
          await storage.createOrder({
            encounterId: encounter.id,
            orderType: "referral",
            description: `Suggested: ${aiResult.disposition}`,
            aiGenerated: true,
          });
        }
        
        responseMessage = `Thank you for the information. I've gathered your symptoms and a physician will review your case shortly. Based on the initial assessment:\n\nChief Complaint: ${aiResult.chiefComplaint}\nRecommendation: ${aiResult.disposition}\n\nA physician will confirm this and provide further instructions.`;
      } else {
        responseMessage = aiResponse;
      }
      
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "outbound",
        messageBody: responseMessage,
      });
      
      res.json({
        response: responseMessage,
        encounterId: encounter.id,
        status: encounter.status,
      });
    } catch (error) {
      console.error("Simulate message error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  return httpServer;
}

// Helper function to get AI response
async function getAIResponse(history: { role: "user" | "assistant"; content: string }[], currentMessage: string): Promise<string> {
  try {
    const messages = [
      { role: "system" as const, content: MEDICAL_AI_SYSTEM_PROMPT },
      ...history,
    ];
    
    // Add current message if not already in history
    if (history.length === 0 || history[history.length - 1].content !== currentMessage) {
      messages.push({ role: "user" as const, content: currentMessage });
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_completion_tokens: 500,
    });
    
    return response.choices[0]?.message?.content || "I apologize, I'm having trouble processing your request. Please try again.";
  } catch (error) {
    console.error("AI response error:", error);
    return "I apologize, I'm experiencing technical difficulties. Please try again in a moment.";
  }
}

// Helper function to send WhatsApp message
async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_NUMBER,
    to: to,
    body: body,
  });
}
