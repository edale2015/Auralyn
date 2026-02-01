import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Tri = "yes" | "no" | "ns";

const QUESTIONS: { key: string; label: string }[] = [
  { key: "fever", label: "Fever" },
  { key: "chest_pain", label: "Chest pain" },
  { key: "shortness_of_breath", label: "Shortness of breath" },
  { key: "confusion", label: "Confusion" },
  { key: "vomiting", label: "Vomiting" },
  { key: "diarrhea", label: "Diarrhea" },
  { key: "rash", label: "Rash" },
  { key: "sore_throat", label: "Sore throat" },
  { key: "cough", label: "Cough" },
  { key: "headache", label: "Headache" },
  { key: "body_aches", label: "Body aches" },
  { key: "fatigue", label: "Fatigue" },
  { key: "runny_nose", label: "Runny nose" },
  { key: "ear_pain", label: "Ear pain" },
  { key: "loss_of_taste", label: "Loss of taste/smell" },
];

interface SymptomGridProps {
  value: Record<string, Tri>;
  onChange: (next: Record<string, Tri>) => void;
}

export default function SymptomGrid({ value, onChange }: SymptomGridProps) {
  function set(key: string, tri: Tri) {
    onChange({ ...value, [key]: tri });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-symptoms-title">Symptoms</CardTitle>
        <CardDescription>Tap Yes / No / Not sure for each symptom.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUESTIONS.map((q) => (
            <div
              key={q.key}
              className="border rounded-lg p-3 space-y-2"
              data-testid={`card-symptom-${q.key}`}
            >
              <div className="text-sm font-medium">{q.label}</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={value[q.key] === "yes" ? "default" : "outline"}
                  className={cn("flex-1", value[q.key] === "yes" && "bg-green-600 hover:bg-green-700")}
                  onClick={() => set(q.key, "yes")}
                  data-testid={`button-symptom-${q.key}-yes`}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant={value[q.key] === "no" ? "default" : "outline"}
                  className={cn("flex-1", value[q.key] === "no" && "bg-red-600 hover:bg-red-700")}
                  onClick={() => set(q.key, "no")}
                  data-testid={`button-symptom-${q.key}-no`}
                >
                  No
                </Button>
                <Button
                  size="sm"
                  variant={value[q.key] === "ns" ? "default" : "outline"}
                  className={cn("flex-1", value[q.key] === "ns" && "bg-gray-600 hover:bg-gray-700")}
                  onClick={() => set(q.key, "ns")}
                  data-testid={`button-symptom-${q.key}-ns`}
                >
                  ?
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
