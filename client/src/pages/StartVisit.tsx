import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, MessageSquare } from "lucide-react";

export default function StartVisit() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      setLocation(`/intake/${code.trim()}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4" data-testid="start-visit-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Stethoscope className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-welcome-title">Welcome</CardTitle>
          <CardDescription>
            Start your virtual visit or continue where you left off
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Enter your visit link or code</Label>
              <Input
                id="token"
                data-testid="input-visit-code"
                type="text"
                placeholder="Paste your link or code here"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              data-testid="button-start-visit"
              className="w-full"
              disabled={!code.trim()}
            >
              Continue to Visit
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Don't have a code? Start a new visit via WhatsApp
            </p>
            <Button
              data-testid="button-whatsapp-help"
              variant="outline"
              className="w-full"
              onClick={() => window.open("https://wa.me/?text=Hi", "_blank")}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Message Us on WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
