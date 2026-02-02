import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ConsentData {
  telehealth: boolean;
  privacy: boolean;
  signatureName: string;
}

interface ConsentPanelProps {
  value: ConsentData;
  onChange: (next: ConsentData) => void;
  disabled?: boolean;
}

export default function ConsentPanel({ value, onChange, disabled }: ConsentPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-consent-title">Consent & Signature</CardTitle>
        <CardDescription>Please review and sign to continue.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="telehealth"
            checked={value.telehealth}
            onCheckedChange={(checked) => onChange({ ...value, telehealth: checked as boolean })}
            data-testid="checkbox-consent-telehealth"
            disabled={disabled}
          />
          <Label htmlFor="telehealth" className="text-sm leading-relaxed">
            I consent to receive telehealth services and understand that this is not a substitute for in-person emergency care.
          </Label>
        </div>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="privacy"
            checked={value.privacy}
            onCheckedChange={(checked) => onChange({ ...value, privacy: checked as boolean })}
            data-testid="checkbox-consent-privacy"
            disabled={disabled}
          />
          <Label htmlFor="privacy" className="text-sm leading-relaxed">
            I have read and agree to the Privacy Policy and Terms of Service.
          </Label>
        </div>

        <div className="space-y-2 pt-4">
          <Label htmlFor="signature">Electronic Signature (type your full name)</Label>
          <Input
            id="signature"
            value={value.signatureName}
            onChange={(e) => onChange({ ...value, signatureName: e.target.value })}
            placeholder="John Doe"
            data-testid="input-consent-signature"
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
