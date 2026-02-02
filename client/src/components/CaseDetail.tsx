import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  X, 
  CheckCircle, 
  AlertTriangle, 
  MessageSquare,
  Stethoscope,
  FileText,
  Clock,
  User,
  Activity,
  ArrowRight,
  ChevronDown,
  Send
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import type { Encounter, WhatsappMessage, Order } from "@shared/schema";
import EhrExportPack from "@/components/EhrExportPack";
import LinkIntakeCaseCard from "@/components/LinkIntakeCaseCard";

interface CaseDetailProps {
  encounterId: number;
  physicianId: number;
  onClose: () => void;
}

const approvalSchema = z.object({
  physicianDiagnosis: z.string().min(1, "Diagnosis is required"),
  physicianDisposition: z.string().min(1, "Disposition is required"),
  physicianNotes: z.string().optional(),
});

type ApprovalForm = z.infer<typeof approvalSchema>;

interface EncounterWithDetails extends Encounter {
  messages?: WhatsappMessage[];
  orders?: Order[];
  intakeCaseId?: string;
}

const CLARIFICATION_TEMPLATES = [
  {
    id: "onset",
    label: "When did this start?",
    message: `Thanks — one quick question so we can advise safely:\n1) When did this start?\nReply with a short answer (e.g., "today 2pm").`,
  },
  {
    id: "severity",
    label: "Severity + red flags",
    message: `To guide next steps, please reply:\n1) Any trouble breathing, chest pain, fainting, severe weakness/confusion, or severe bleeding? (Yes/No)\n2) Rate your worst symptom 0–10.`,
  },
  {
    id: "meds",
    label: "Meds & allergies",
    message: `Before we advise, please reply with:\n1) Any medication allergies?\n2) Current medicines (or "none").\n3) Are you pregnant or could you be pregnant? (Yes/No/Not sure)`,
  },
];

export default function CaseDetail({ encounterId, physicianId, onClose }: CaseDetailProps) {
  const { toast } = useToast();
  const [clarifyDialogOpen, setClarifyDialogOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  const { data: encounter, isLoading } = useQuery<EncounterWithDetails>({
    queryKey: ["/api/encounters", encounterId],
  });

  const form = useForm<ApprovalForm>({
    resolver: zodResolver(approvalSchema),
    defaultValues: {
      physicianDiagnosis: "",
      physicianDisposition: "",
      physicianNotes: "",
    },
  });

  // Pre-fill form with AI suggestions when encounter loads
  if (encounter && !form.formState.isDirty) {
    if (encounter.aiDiagnosis && !form.getValues("physicianDiagnosis")) {
      form.setValue("physicianDiagnosis", encounter.aiDiagnosis);
    }
    if (encounter.aiDisposition && !form.getValues("physicianDisposition")) {
      form.setValue("physicianDisposition", encounter.aiDisposition);
    }
  }

  const approveMutation = useMutation({
    mutationFn: async (data: ApprovalForm) => {
      return apiRequest("POST", `/api/encounters/${encounterId}/approve`, {
        ...data,
        physicianId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Case Approved",
        description: "The case has been signed off successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve case",
        variant: "destructive",
      });
    },
  });

  const requestClarificationMutation = useMutation({
    mutationFn: async (message: string) => {
      return apiRequest("POST", `/api/review/${encounterId}/request-clarification`, {
        message,
      });
    },
    onSuccess: () => {
      toast({
        title: "Clarification Sent",
        description: "A message has been sent to the patient.",
      });
      setClarifyDialogOpen(false);
      setCustomMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send clarification",
        variant: "destructive",
      });
    },
  });

  const sendClarification = (message: string) => {
    if (!message.trim()) return;
    requestClarificationMutation.mutate(message);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-8" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Case not found</p>
      </div>
    );
  }

  const isApproved = encounter.status === "approved";
  const isPending = encounter.status === "pending_review";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card sticky top-0 z-10">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Stethoscope className="w-5 h-5" />
            Case #{encounter.id}
          </h3>
          <p className="text-sm text-muted-foreground">
            Created {formatDistanceToNow(new Date(encounter.createdAt), { addSuffix: true })}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-detail">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Chief Complaint */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Chief Complaint
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {encounter.chiefComplaint || "Not yet determined"}
              </p>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                AI Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Suggested Diagnosis
                  </Label>
                  <p className="text-sm font-medium mt-1">
                    {encounter.aiDiagnosis || "Pending analysis..."}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Suggested Disposition
                  </Label>
                  <p className="text-sm font-medium mt-1">
                    {encounter.aiDisposition || "Pending analysis..."}
                  </p>
                </div>
              </div>
              {encounter.aiConfidence && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Confidence
                  </Label>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ width: `${encounter.aiConfidence}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono">{encounter.aiConfidence}%</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* WhatsApp Conversation */}
          {encounter.messages && encounter.messages.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Conversation History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-64 overflow-auto">
                  {encounter.messages.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div 
                        className={`max-w-[80%] p-3 rounded-lg text-sm ${
                          msg.direction === "outbound" 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted"
                        }`}
                      >
                        <p>{msg.messageBody}</p>
                        <p className={`text-xs mt-1 ${
                          msg.direction === "outbound" 
                            ? "text-primary-foreground/70" 
                            : "text-muted-foreground"
                        }`}>
                          {format(new Date(msg.createdAt), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Suggested Orders */}
          {encounter.orders && encounter.orders.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Suggested Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {encounter.orders.map((order) => (
                    <div 
                      key={order.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                    >
                      <div>
                        <Badge variant="outline" className="mb-1">
                          {order.orderType}
                        </Badge>
                        <p className="text-sm">{order.description}</p>
                      </div>
                      {order.physicianApproved ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Clock className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Physician Approval Form */}
          {isPending && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Physician Sign-Off
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => approveMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="physicianDiagnosis"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Final Diagnosis</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Enter final diagnosis"
                              data-testid="input-diagnosis"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="physicianDisposition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Disposition</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-disposition">
                                <SelectValue placeholder="Select disposition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="discharge">Discharge with instructions</SelectItem>
                              <SelectItem value="telehealth">Schedule telehealth visit</SelectItem>
                              <SelectItem value="in-person">Schedule in-person visit</SelectItem>
                              <SelectItem value="urgent-care">Refer to urgent care</SelectItem>
                              <SelectItem value="ed">Refer to emergency department</SelectItem>
                              <SelectItem value="specialist">Refer to specialist</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="physicianNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Additional Notes (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Enter any additional notes..."
                              className="min-h-[80px]"
                              data-testid="input-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Separator />

                    <div className="flex gap-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={requestClarificationMutation.isPending}
                            data-testid="button-request-clarification"
                          >
                            Request Clarification
                            <ChevronDown className="w-4 h-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuLabel>Quick Templates</DropdownMenuLabel>
                          {CLARIFICATION_TEMPLATES.map((t) => (
                            <DropdownMenuItem
                              key={t.id}
                              onClick={() => sendClarification(t.message)}
                              data-testid={`template-${t.id}`}
                            >
                              {t.label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setClarifyDialogOpen(true)}
                            data-testid="template-custom"
                          >
                            Custom message...
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={approveMutation.isPending}
                        data-testid="button-approve"
                      >
                        {approveMutation.isPending ? "Approving..." : "Approve & Sign Off"}
                        <CheckCircle className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {/* Already Approved */}
          {isApproved && (
            <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  Case Approved
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-xs text-green-700/70 dark:text-green-400/70 uppercase tracking-wide">
                      Final Diagnosis
                    </Label>
                    <p className="text-sm font-medium mt-1 text-green-800 dark:text-green-300">
                      {encounter.physicianDiagnosis}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-green-700/70 dark:text-green-400/70 uppercase tracking-wide">
                      Disposition
                    </Label>
                    <p className="text-sm font-medium mt-1 text-green-800 dark:text-green-300">
                      {encounter.physicianDisposition}
                    </p>
                  </div>
                </div>
                {encounter.physicianNotes && (
                  <div>
                    <Label className="text-xs text-green-700/70 dark:text-green-400/70 uppercase tracking-wide">
                      Notes
                    </Label>
                    <p className="text-sm mt-1 text-green-800 dark:text-green-300">
                      {encounter.physicianNotes}
                    </p>
                  </div>
                )}
                {encounter.approvedAt && (
                  <p className="text-xs text-green-600 dark:text-green-500">
                    Approved {format(new Date(encounter.approvedAt), "PPp")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Intake Case Linking / EHR Export Pack */}
          {encounter.intakeCaseId ? (
            <EhrExportPack caseId={encounter.intakeCaseId} />
          ) : (
            <LinkIntakeCaseCard encounterId={encounter.id} />
          )}
        </div>
      </ScrollArea>

      <Dialog open={clarifyDialogOpen} onOpenChange={setClarifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Custom Clarification</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Type your message to the patient..."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="min-h-[120px]"
            data-testid="input-custom-clarification"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClarifyDialogOpen(false)}
              data-testid="button-cancel-clarification"
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendClarification(customMessage)}
              disabled={!customMessage.trim() || requestClarificationMutation.isPending}
              data-testid="button-send-clarification"
            >
              {requestClarificationMutation.isPending ? "Sending..." : "Send"}
              <Send className="w-4 h-4 ml-2" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
