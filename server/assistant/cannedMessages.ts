export interface CannedMessage {
  id: string
  label: string
  text: string
  category: "intake" | "clarify" | "reassure" | "escalate" | "close"
}

export const CANNED_MESSAGES: CannedMessage[] = [
  // Intake
  { id: "c1", label: "Greet", category: "intake", text: "Hello! Thank you for reaching out. I'm reviewing your message now. Can you describe your main symptom?" },
  { id: "c2", label: "Duration?", category: "intake", text: "How long have you had this symptom? Did it start suddenly or gradually?" },
  { id: "c3", label: "Severity?", category: "intake", text: "On a scale of 1 to 10, how would you rate the severity right now?" },
  { id: "c4", label: "Fever?", category: "clarify", text: "Have you checked your temperature? Do you have a fever?" },
  { id: "c5", label: "Meds?", category: "clarify", text: "Are you currently taking any medications or have any allergies?" },
  { id: "c6", label: "Worse?", category: "clarify", text: "Is it getting better, worse, or staying the same since it started?" },
  // Reassure
  { id: "c7", label: "Reassure", category: "reassure", text: "Based on what you've described, this sounds manageable. Let me put together a plan for you." },
  { id: "c8", label: "Wait for results", category: "reassure", text: "I've reviewed your information. Please give me a moment to finalize my recommendations." },
  // Escalate
  { id: "c9", label: "Go to ER", category: "escalate", text: "⚠️ Based on your symptoms, I recommend you go to the nearest emergency room immediately. Please do not drive yourself." },
  { id: "c10", label: "Call 911", category: "escalate", text: "🚨 Please call 911 or have someone take you to the ER right now. This needs immediate evaluation." },
  { id: "c11", label: "Urgent Care", category: "escalate", text: "I recommend you go to an urgent care center today for further evaluation. Please do not wait." },
  // Close
  { id: "c12", label: "Plan sent", category: "close", text: "I've sent you the care plan and instructions. Please follow up if symptoms worsen or don't improve within 48–72 hours." },
  { id: "c13", label: "Discharge", category: "close", text: "Your visit summary has been prepared. Take care, and don't hesitate to reach out if you need anything." },
]

export const CANNED_BY_CATEGORY = CANNED_MESSAGES.reduce(
  (acc, m) => {
    acc[m.category] = acc[m.category] ?? []
    acc[m.category].push(m)
    return acc
  },
  {} as Record<string, CannedMessage[]>
)
