import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/context/AuthContext";
import { Stethoscope, Lock, Mail } from "lucide-react";

const clinicSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

const roleSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password is required"),
});

type ClinicForm = z.infer<typeof clinicSchema>;
type RoleForm = z.infer<typeof roleSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [tab, setTab] = useState("clinic");

  const clinicForm = useForm<ClinicForm>({
    resolver: zodResolver(clinicSchema),
    defaultValues: { password: "" },
  });

  const roleForm = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: { email: "", password: "" },
  });

  const clinicMutation = useMutation({
    mutationFn: async (data: ClinicForm) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        password: data.password,
        email: "provider@clinic.local",
      });
      return response.json();
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast({ title: "Login Successful", description: "Welcome back!" });
        setLocation("/ops");
      } else {
        throw new Error(result.error || "Login failed");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Login Failed", description: error.message || "Invalid password", variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (data: RoleForm) => {
      await login(data.email, data.password);
    },
    onSuccess: () => {
      toast({ title: "Login Successful", description: "Welcome!" });
      setLocation("/ops");
    },
    onError: (error: Error) => {
      toast({ title: "Login Failed", description: error.message || "Invalid credentials", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Stethoscope className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Auralyn</CardTitle>
            <CardDescription className="mt-2">Medical Triage System</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="clinic" data-testid="tab-clinic">Clinic Login</TabsTrigger>
              <TabsTrigger value="role" data-testid="tab-role">Admin / Physician</TabsTrigger>
            </TabsList>

            <TabsContent value="clinic">
              <Form {...clinicForm}>
                <form onSubmit={clinicForm.handleSubmit((d) => clinicMutation.mutate(d))} className="space-y-4">
                  <FormField
                    control={clinicForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinic Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input {...field} type="password" placeholder="Enter clinic password" className="pl-10" data-testid="input-clinic-password" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={clinicMutation.isPending} data-testid="button-clinic-login">
                    {clinicMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="role">
              <Form {...roleForm}>
                <form onSubmit={roleForm.handleSubmit((d) => roleMutation.mutate(d))} className="space-y-4">
                  <FormField
                    control={roleForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input {...field} type="email" placeholder="admin@example.com" className="pl-10" data-testid="input-email" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={roleForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input {...field} type="password" placeholder="Enter password" className="pl-10" data-testid="input-role-password" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={roleMutation.isPending} data-testid="button-role-login">
                    {roleMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
