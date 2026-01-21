# Gold Slice V1 - ENT Flu Triage System

**Frozen Date**: January 21, 2026  
**Commit**: See git log for current HEAD

## What's Included

This "Gold Slice" represents a fully functional, end-to-end medical triage system for ENT flu-like symptoms.

### Core Features

1. **WhatsApp Integration**
   - Twilio webhook for incoming patient messages
   - Outbound notifications for physician approvals

2. **Deterministic 19-Question Questionnaire**
   - Red flag detection (SOB, chest pain, neuro symptoms, dehydration)
   - Symptom onset tracking
   - Medication/allergy screening (pregnancy, HTN, SSRI, anxiety)
   - Test result collection (COVID, Flu)

3. **Clinical Decision Support**
   - Tamiflu eligibility calculation (onset ≤2 days + fever + aches)
   - Medication suggestions with contraindication pruning
   - Test recommendations (COVID, Influenza)
   - Disposition recommendations

4. **Physician Dashboard**
   - Secure login (username/password)
   - Pending case queue with urgency badges
   - Case detail view with patient summary
   - Approval workflow with diagnosis/disposition/notes

5. **Firebase Firestore Persistence**
   - All data persists across server restarts
   - Collections: physicians, patients, encounters, orders, whatsapp_messages

## How to Verify

Run the smoke test to validate all functionality:

```bash
npx tsx scripts/smoke-test.ts
```

Expected output: 14/14 tests passing

## Test Coverage

The smoke test validates:
- Encounter creation via WhatsApp
- Complete 19-question flow
- Proposal generation with Tamiflu eligibility
- Red flag detection
- Medication and test suggestions
- Status transitions (gathering_info → pending_review → approved)
- Physician approval with diagnosis/notes
- WhatsApp notification on approval

## Next Steps (Post-Gold Slice)

1. Sheet-driven questions (Google Sheets for dynamic content)
2. ChatGPT phrasing layer (AI for message polish only)
3. Centor sore throat module (new clinical capability)
