# ENT Flu Slice - Medical Triage System

## Overview
This project, "env_flu_slice", is a medical triage platform that streamlines the review and approval of patient cases by physicians. It utilizes WhatsApp as the primary patient interface for a deterministic ENT Flu questionnaire flow. The system gathers symptoms and medical information, generates a proposed diagnosis and treatment plan, and queues cases for physician review. Once a physician approves, the disposition and orders are communicated back to the patient via WhatsApp. The platform aims to efficiently manage medical consultations for flu-like symptoms, with a fallback for patients who prefer WhatsApp-based Q&A.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS with custom healthcare design tokens
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend
- **Framework**: Express 5 on Node.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: REST endpoints (`/api/*`)
- **Build**: esbuild

### Data Storage
- **Database**: Firebase Firestore
- **Admin SDK**: `firebase-admin`
- **Schema**: Defined in `shared/schema.ts` (physicians, patients, encounters, orders, whatsapp_messages)

### Authentication
- Simple username/password login for physicians.
- Client-side session storage in localStorage.

### Key Data Models
- **Physicians**: Medical staff for case review.
- **Patients**: Identified by WhatsApp phone number.
- **Encounters**: Medical cases with AI diagnosis, urgency, and status.
- **Orders**: Follow-up actions.
- **WhatsApp Messages**: Conversation history.

## External Dependencies

### AI Integration
- **OpenAI API**: For medical triage AI conversations.

### Messaging Integration
- **Twilio**: For WhatsApp patient communication.

### Database
- **Firebase Firestore**: Primary database.

### Google Sheets Integration
- **Flow Questions**: Dynamically loads questionnaire questions from the `ENT_FLU_QUESTIONS` tab.
- **Clinical Rules**: Dynamically loads clinical decision rules from the `ENT_FLU_RULES` tab.

### Replit Integrations
- **Audio**: Voice chat with speech-to-text and text-to-speech.
- **Chat**: Conversation management with streaming responses.
- **Image**: Image generation via OpenAI.
- **Batch**: Rate-limited batch processing utilities.