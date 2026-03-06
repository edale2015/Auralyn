import { Badge } from "@/components/ui/badge";
import { Bot, User } from "lucide-react";

export type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  text: string;
  createdAt: string;
  token?: string;
};

type Props = {
  messages: ChatMessage[];
};

export function ChatMessageList({ messages }: Props) {
  return (
    <div className="space-y-3 min-h-[300px] mb-4" data-testid="chat-message-list">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          data-testid={`chat-message-${m.id}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-3 ${
              m.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-xs opacity-70">
              {m.role === "user" ? (
                <User className="h-3 w-3" />
              ) : (
                <Bot className="h-3 w-3" />
              )}
              <span>{m.role}</span>
              {m.token && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  {m.token}
                </Badge>
              )}
            </div>
            <div className="text-sm">{m.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
