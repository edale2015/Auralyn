import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

type Props = {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
};

export function AnswerInput({ disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setValue("");
  }

  return (
    <div className="flex gap-2" data-testid="answer-input-container">
      <Input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Type your answer..."
        className="flex-1"
        data-testid="input-answer"
      />
      <Button
        onClick={submit}
        disabled={disabled || !value.trim()}
        size="sm"
        data-testid="button-send-answer"
      >
        <Send className="h-4 w-4 mr-1" />
        Send
      </Button>
    </div>
  );
}
