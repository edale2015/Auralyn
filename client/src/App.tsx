import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import PatientIntake from "@/pages/PatientIntake";
import IntakeStatus from "@/pages/IntakeStatus";
import IntakeSummary from "@/pages/IntakeSummary";
import StartVisit from "@/pages/StartVisit";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/start" component={StartVisit} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/intake/:token" component={PatientIntake} />
      <Route path="/intake/:token/status" component={IntakeStatus} />
      <Route path="/intake/:token/summary" component={IntakeSummary} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
