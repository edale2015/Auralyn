/**
 * ENT Flu Slice - Gold Slice Smoke Test
 * 
 * This script validates the complete end-to-end flow:
 * 1. Encounter creation via WhatsApp webhook
 * 2. 19-question deterministic questionnaire flow
 * 3. Proposal generation with Tamiflu eligibility
 * 4. Physician approval and status transitions
 * 5. WhatsApp notification on approval
 * 
 * Run with: npx tsx scripts/smoke-test.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`[SMOKE TEST] ${message}`);
}

function pass(name: string, details?: string) {
  results.push({ name, passed: true, details });
  console.log(`  ✓ ${name}${details ? `: ${details}` : ''}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  ✗ ${name}: ${error}`);
}

async function sendWhatsAppMessage(phone: string, body: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `From=whatsapp:${phone}&Body=${encodeURIComponent(body)}`,
  });
  return response.text();
}

async function getPendingEncounters(): Promise<any[]> {
  const response = await fetch(`${BASE_URL}/api/encounters/pending`);
  return response.json();
}

async function getEncounter(id: number): Promise<any> {
  const response = await fetch(`${BASE_URL}/api/encounters/${id}`);
  return response.json();
}

async function approveEncounter(id: number, data: any): Promise<any> {
  const response = await fetch(`${BASE_URL}/api/encounters/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

async function runSmokeTest() {
  const testPhone = `+1555${Date.now().toString().slice(-7)}`;
  log(`Starting smoke test with phone: ${testPhone}`);
  log('='.repeat(60));

  // Test 1: Start encounter
  log('\n1. ENCOUNTER CREATION');
  try {
    await sendWhatsAppMessage(testPhone, 'hi');
    await new Promise(r => setTimeout(r, 500));
    pass('WhatsApp webhook accepts initial message');
  } catch (e: any) {
    fail('WhatsApp webhook accepts initial message', e.message);
    return printSummary();
  }

  // Test 2: Complete 19-question flow
  log('\n2. QUESTIONNAIRE FLOW (19 questions)');
  const answers = [
    'no',   // RF_SOB
    'no',   // RF_CP
    'no',   // RF_NEURO
    'no',   // RF_DEHY
    '1',    // ONSET_DAYS (1 day - eligible for Tamiflu)
    'yes',  // FEVER
    'yes',  // ACHES
    'yes',  // COUGH
    'no',   // SORE_THROAT
    'no',   // CONGESTION
    'no',   // EAR_PAIN
    'no',   // GI
    'no',   // PREGNANT
    'no',   // HTN
    'no',   // ANXIETY
    'no',   // SSRI
    'no',   // ALLERGIES
    'no',   // COVID_POS
    'no',   // FLU_POS
  ];

  try {
    for (let i = 0; i < answers.length; i++) {
      await sendWhatsAppMessage(testPhone, answers[i]);
      await new Promise(r => setTimeout(r, 300));
    }
    pass('All 19 questions answered');
  } catch (e: any) {
    fail('Questionnaire flow', e.message);
    return printSummary();
  }

  // Test 3: Verify encounter in pending queue
  log('\n3. PENDING QUEUE');
  let encounter: any;
  try {
    await new Promise(r => setTimeout(r, 1000)); // Wait for processing
    const pending = await getPendingEncounters();
    encounter = pending.find((e: any) => {
      // Find by checking messages or most recent
      return e.status === 'pending_review';
    });
    
    if (!encounter) {
      fail('Encounter appears in pending queue', 'No pending encounters found');
      return printSummary();
    }
    pass('Encounter appears in pending queue', `ID: ${encounter.id}`);
  } catch (e: any) {
    fail('Pending queue check', e.message);
    return printSummary();
  }

  // Test 4: Verify proposal generation
  log('\n4. PROPOSAL GENERATION');
  try {
    const encounterData = await getEncounter(encounter.id);
    const proposalRaw = encounterData.proposal;
    const proposal = typeof proposalRaw === 'string' 
      ? JSON.parse(proposalRaw) 
      : proposalRaw;
    
    if (!proposal) {
      fail('Proposal generated', 'No proposal found');
      return printSummary();
    }
    pass('Proposal generated');

    // Check specific proposal fields
    if (proposal.redFlag === false) {
      pass('Red flag detection', 'No red flags (correct)');
    } else {
      fail('Red flag detection', 'Unexpected red flag');
    }

    if (proposal.tamifluEligible === true) {
      pass('Tamiflu eligibility', 'Eligible (onset ≤2 days + fever + aches)');
    } else {
      fail('Tamiflu eligibility', 'Should be eligible');
    }

    if (proposal.meds && proposal.meds.length > 0) {
      pass('Medication suggestions', proposal.meds.join(', '));
    } else {
      fail('Medication suggestions', 'No medications suggested');
    }

    if (proposal.tests && proposal.tests.length > 0) {
      pass('Test recommendations', proposal.tests.join(', '));
    } else {
      fail('Test recommendations', 'No tests suggested');
    }
  } catch (e: any) {
    fail('Proposal verification', e.message);
  }

  // Test 5: Status transitions
  log('\n5. STATUS TRANSITIONS');
  try {
    const encounterData = await getEncounter(encounter.id);
    if (encounterData.status === 'pending_review') {
      pass('Initial status', 'pending_review');
    } else {
      fail('Initial status', `Expected pending_review, got ${encounterData.status}`);
    }
  } catch (e: any) {
    fail('Status check', e.message);
  }

  // Test 6: Physician approval
  log('\n6. PHYSICIAN APPROVAL');
  try {
    const approvalData = {
      physicianId: 1,
      physicianDiagnosis: 'Viral URI - Smoke Test',
      physicianDisposition: 'self_care',
      physicianNotes: 'Smoke test approval. Continue supportive care.',
    };

    const approved = await approveEncounter(encounter.id, approvalData);
    
    if (approved.status === 'approved') {
      pass('Approval status transition', 'pending_review → approved');
    } else {
      fail('Approval status transition', `Status is ${approved.status}`);
    }

    if (approved.physicianId === 1) {
      pass('Physician ID recorded');
    } else {
      fail('Physician ID recorded', 'Missing physician ID');
    }

    if (approved.physicianDiagnosis) {
      pass('Physician diagnosis recorded', approved.physicianDiagnosis);
    } else {
      fail('Physician diagnosis recorded', 'Missing diagnosis');
    }

    if (approved.approvedAt) {
      pass('Approval timestamp recorded', new Date(approved.approvedAt).toISOString());
    } else {
      fail('Approval timestamp recorded', 'Missing timestamp');
    }
  } catch (e: any) {
    fail('Physician approval', e.message);
  }

  // Test 7: Verify WhatsApp message was logged
  log('\n7. WHATSAPP NOTIFICATION');
  try {
    await new Promise(r => setTimeout(r, 500)); // Wait for message creation
    const encounterData = await getEncounter(encounter.id);
    const outboundMessages = encounterData.messages?.filter(
      (m: any) => m.direction === 'outbound' && m.messageBody?.includes('reviewed by a physician')
    );

    if (outboundMessages && outboundMessages.length > 0) {
      pass('Approval notification logged', 'Message saved to database');
    } else {
      fail('Approval notification logged', 'No outbound approval message found');
    }
  } catch (e: any) {
    fail('WhatsApp notification check', e.message);
  }

  printSummary();
}

function printSummary() {
  log('\n' + '='.repeat(60));
  log('SMOKE TEST SUMMARY');
  log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\n  Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n  FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - ${r.name}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  
  if (failed === 0) {
    console.log('  🎉 GOLD SLICE VERIFIED - All tests passed!');
    process.exit(0);
  } else {
    console.log('  ❌ SMOKE TEST FAILED - Fix issues before proceeding');
    process.exit(1);
  }
}

runSmokeTest().catch(e => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
