import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiFetch, getOrCreateCorrelationId } from '@/lib/correlation';

interface PhysicianOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  encounterId: string;
  originalRecommendation: string;
  onSaved?: () => void;
}

export default function PhysicianOverrideDialog({
  open,
  onOpenChange,
  encounterId,
  originalRecommendation,
  onSaved,
}: PhysicianOverrideDialogProps) {
  const [overrideValue, setOverrideValue] = useState('');
  const [rationale, setRationale]         = useState('');
  const [saving, setSaving]               = useState(false);
  const { toast } = useToast();

  async function submit() {
    if (!overrideValue.trim() || !rationale.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/clinical/encounters/${encounterId}/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalRecommendation,
          overrideValue,
          rationale,
          correlationId: getOrCreateCorrelationId(),
          timestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Override saved', description: 'The physician override has been recorded.' });
      setOverrideValue('');
      setRationale('');
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Could not save the override. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Physician Override</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Original AI recommendation</Label>
            <p
              className="mt-1 text-sm font-medium border rounded-md px-3 py-2 bg-muted/40"
              data-testid="text-original-recommendation"
            >
              {originalRecommendation || '—'}
            </p>
          </div>

          <div>
            <Label htmlFor="override-value">Override decision</Label>
            <Input
              id="override-value"
              data-testid="input-override-value"
              className="mt-1"
              placeholder="Enter your clinical decision"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="override-rationale">
              Rationale <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="override-rationale"
              data-testid="input-override-rationale"
              className="mt-1"
              placeholder="Required — document clinical reasoning for this override"
              rows={4}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-override"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!overrideValue.trim() || !rationale.trim() || saving}
            data-testid="button-save-override"
          >
            {saving ? 'Saving…' : 'Save Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
