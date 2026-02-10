# ENT Flu Slice - Medical Triage System

## Overview
"env_flu_slice" is a medical triage platform that streamlines patient case review and approval by physicians. It uses WhatsApp for a deterministic ENT Flu questionnaire flow, collecting symptoms and medical information to generate proposed diagnoses and treatment plans. Cases are then queued for physician review, and upon approval, dispositions and orders are communicated back to the patient via WhatsApp. The platform aims for efficient management of flu-like symptom consultations, with a fallback for WhatsApp-based Q&A.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **UI/UX**: shadcn/ui (built on Radix UI) with Tailwind CSS and custom healthcare design tokens.
- **Key Pages**: Physician login, patient entry, intake form, case status, signed visit summary, and physician dashboard. Autosave is implemented for patient intake drafts.

### Backend
- **Framework**: Express 5 on Node.js with TypeScript.
- **API Pattern**: REST endpoints (`/api/*`).
- **Agentic Spine**: Uses a constrained agent architecture for deterministic medical triage decisions, including a next-action picker, action execution with trace capture, and a plan/act/observe agent loop. It incorporates Centor score calculation, red flag detection, and a supervisor gate for patient-visible outputs.
- **LLM Integration**: Supports LLM-powered actions for rephrasing questions and drafting summaries, using Replit AI Integrations (OpenAI-compatible) with model `gpt-5-mini`.

### Data Storage
- **Database**: Firebase Firestore (primary) and SQLite (for intake storage abstraction, configurable).
- **Schema**: Defined for physicians, patients, encounters, orders, WhatsApp messages, and cases.
- **Trace Storage**: Agent traces and LLM call logs are collected in Firestore (or in-memory for dev).

### Authentication
- **Provider Login**: Password-only session-based authentication via HMAC-signed httpOnly cookies.
- **Patient Access**: Token-based intake access with 6-digit code verification.
- **API Key Fallback**: `X-Provider-Key` for development/scripts.

### EHR Integration
- **Architecture**: Scaffolding for vendor-neutral interface with SMART on FHIR discovery and FHIR client helpers. `eClinicalWorks` connector is credential-ready; `Athena` is a stub. This feature is planned for a later phase.

### Regression Testing Gate
- **Purpose**: Ensures consistent agent behavior with hard and soft failure classifications.
- **Endpoints**: `/api/test/rules/snapshot`, `/api/test/agent-run`, `/api/test/compare`.
- **Test Cases**: Golden test cases stored in `server/testcases/*.json` with expected outcomes.
- **Normalized Output**: Agent runs return normalized `final` output including disposition, diagnosis, scores, and red flags.

### Configuration
- **Validation**: Zod-based environment variable validation at startup.
- **Firebase**: Lazy initialization, consumers use `getFirestore()`.
- **Google Sheets**: Centralized singleton client for loading rules, medications, and diagnoses.

## External Dependencies

- **AI Integration**: OpenAI API (via Replit AI Integrations) for medical triage AI conversations.
- **Messaging Integration**: Twilio for WhatsApp patient communication.
- **Database**: Firebase Firestore.
- **Google Sheets Integration**: Dynamically loads questionnaire questions, clinical decision rules, medications, and diagnoses.
- **Cloud Storage**: Firebase Storage for file uploads (configurable).