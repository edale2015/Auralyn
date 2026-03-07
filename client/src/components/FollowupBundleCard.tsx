import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpCircle } from "lucide-react";

type Props = {
  caseId: string;
};

type FollowupQuestion = {
  token: string;
  questionText: string;
  priorityScore?: number;
};

type FollowupBundle = {
  title: string;
  questions: FollowupQuestion[];
};

export function FollowupBundleCard({ caseId }: Props) {
  const { authFetch } = useAuth();
  const [bundle, setBundle] = useState<FollowupBundle | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch(`/api/chatFollowupBundle/${caseId}`);
        const json = await res.json();
        if (res.ok) setBundle(json);
      } catch {
      }
    }
    load();
  }, [caseId]);

  if (!bundle) return null;

  return (
    <Card data-testid={`followup-bundle-${caseId}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          {bundle.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bundle.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="followup-none">
            No further follow-up questions suggested.
          </p>
        ) : (
          <ul className="space-y-2">
            {bundle.questions.map((q) => (
              <li
                key={q.token}
                className="flex items-start gap-2 text-sm"
                data-testid={`followup-question-${q.token}`}
              >
                <Badge variant="outline" className="text-xs mt-0.5 flex-shrink-0">
                  {q.token}
                </Badge>
                <span>{q.questionText}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
