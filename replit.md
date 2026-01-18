# ENT Flu Slice - Medical Triage System

## Overview

This is a medical triage platform that enables physicians to review and approve patient cases submitted via WhatsApp. The system uses AI (OpenAI GPT) to conduct preliminary patient interviews through WhatsApp, gathering symptoms and medical information before presenting cases to physicians for final review and disposition.

**Project Name**: env_flu_slice

The core workflow is:
1. Patients message via WhatsApp with their symptoms
2. AI conducts a conversational triage interview (gathers chief complaint, asks follow-up questions)
3. AI generates preliminary diagnosis with confidence level and urgency classification
4. Cases are queued for physician review with AI-generated diagnoses/dispositions
5. Physicians approve/reject cases with their own diagnosis and disposition
6. Approved orders/dispositions are sent back to patient via WhatsApp

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query for server state
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS with custom healthcare-adapted design tokens
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express 5 on Node.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: REST endpoints under `/api/*`
- **Build**: esbuild for production bundling with selective dependency bundling

### Data Storage
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` - contains physicians, patients, encounters, orders, and whatsapp_messages tables
- **Current Storage**: MemStorage class in `server/storage.ts` (in-memory, will migrate to Postgres)

### Authentication
- Simple username/password login for physicians
- Session stored in localStorage on client
- No session middleware currently implemented on server

### Key Data Models
- **Physicians**: Medical staff who review and approve cases
- **Patients**: Identified by WhatsApp phone number
- **Encounters**: Medical cases with AI diagnosis, urgency levels, and status tracking
- **Orders**: Follow-up actions tied to encounters
- **WhatsApp Messages**: Conversation history for each encounter

## External Dependencies

### AI Integration
- **OpenAI API**: Used for medical triage AI conversations
- **Environment Variables**: 
  - `AI_INTEGRATIONS_OPENAI_API_KEY`
  - `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Messaging Integration
- **Twilio**: WhatsApp messaging for patient communication
- **Environment Variables**:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WHATSAPP_NUMBER`

### Database
- **PostgreSQL**: Primary database
- **Environment Variables**:
  - `DATABASE_URL`

### Replit Integrations
Located in `server/replit_integrations/` and `client/replit_integrations/`:
- **Audio**: Voice chat with speech-to-text and text-to-speech
- **Chat**: Conversation management with streaming responses
- **Image**: Image generation via OpenAI
- **Batch**: Rate-limited batch processing utilities

### Development Tools
- Replit-specific Vite plugins for error overlay and dev banner
- ffmpeg for audio format conversion (available on Replit by default)

## API Routes

### Authentication
- `POST /api/auth/login` - Physician login with username/password

### Encounters
- `GET /api/encounters` - List encounters, accepts `filter` query param (pending, approved, all)
- `GET /api/encounters/:id` - Get encounter with messages and orders
- `POST /api/encounters/:id/approve` - Physician approval of encounter
- `POST /api/encounters/:id/request-info` - Request more info from patient

### Webhooks
- `POST /api/webhooks/whatsapp` - Twilio WhatsApp webhook for incoming messages

### Testing
- `POST /api/test/simulate-message` - Simulate WhatsApp message for testing

## Default Credentials
- Username: admin
- Password: Set via `MD_PASSWORD` environment variable (default: physician123)

## Recent Changes
- 2026-01-18: Initial MVP implementation
  - Physician login and dashboard
  - Patient queue with urgency badges
  - Case detail panel with physician sign-off form
  - WhatsApp webhook integration with AI triage
  - OpenAI integration for medical triage conversations