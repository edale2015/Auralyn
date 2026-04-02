import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupLabel, 
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ClipboardList, 
  CheckCircle, 
  Clock, 
  LogOut,
  Stethoscope,
  AlertTriangle,
  Users,
  Activity,
  RefreshCw,
} from "lucide-react";
import PatientQueue from "@/components/PatientQueue";
import CaseDetail from "@/components/CaseDetail";
import { useAuth } from "@/lib/providerAuth";
import type { Encounter } from "@shared/schema";

type FilterType = "pending" | "approved" | "all";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [selectedEncounterId, setSelectedEncounterId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>("pending");
  const { isAuthenticated, email, isLoading: authLoading, logout, isLoggingOut } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: encounters = [], isLoading } = useQuery<Encounter[]>({
    queryKey: ["/api/encounters", filter],
    refetchInterval: 10000,
    enabled: isAuthenticated,
  });

  const pendingCount = encounters.filter(e => e.status === "pending_review").length;
  const urgentCount = encounters.filter(e => e.urgencyLevel === "emergent" || e.urgencyLevel === "urgent").length;

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const menuItems = [
    { 
      title: "Pending Review", 
      icon: Clock, 
      filter: "pending" as FilterType,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { 
      title: "Approved Cases", 
      icon: CheckCircle, 
      filter: "approved" as FilterType,
    },
    { 
      title: "All Cases", 
      icon: ClipboardList, 
      filter: "all" as FilterType,
    },
  ];

  if (authLoading || !isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <Sidebar>
          <SidebarHeader className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-semibold truncate">ENT Flu Slice</h1>
                <p className="text-xs text-muted-foreground truncate">Medical Triage</p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {urgentCount > 0 && (
              <SidebarGroup>
                <div className="mx-3 p-3 bg-destructive/10 rounded-md flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {urgentCount} urgent case{urgentCount > 1 ? "s" : ""}
                  </span>
                </div>
              </SidebarGroup>
            )}

            <SidebarGroup>
              <SidebarGroupLabel>Patient Cases</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => {
                          setFilter(item.filter);
                          setSelectedEncounterId(null);
                        }}
                        data-active={filter === item.filter}
                        className="data-[active=true]:bg-sidebar-accent"
                        data-testid={`nav-${item.filter}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-physician-name">
                  Provider
                </p>
                <p className="text-xs text-muted-foreground truncate" data-testid="text-physician-specialty">
                  {email || "Authenticated"}
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start"
              onClick={handleLogout}
              disabled={isLoggingOut}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-4 p-4 border-b">
            <div className="flex items-center gap-3">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h2 className="text-lg font-medium">
                {filter === "pending" && "Pending Review"}
                {filter === "approved" && "Approved Cases"}
                {filter === "all" && "All Cases"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              {pendingCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" />
                  {pendingCount} pending
                </Badge>
              )}
              {urgentCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {urgentCount} urgent
                </Badge>
              )}
            </div>
          </header>

          {/* Stats Summary Row */}
          <div className="grid grid-cols-4 gap-0 border-b bg-muted/20">
            {[
              {
                label: "Pending Review",
                value: isLoading ? null : pendingCount,
                icon: Clock,
                color: pendingCount > 0 ? "text-amber-600" : "text-muted-foreground",
                testId: "stat-pending",
              },
              {
                label: "Urgent Cases",
                value: isLoading ? null : urgentCount,
                icon: AlertTriangle,
                color: urgentCount > 0 ? "text-red-600" : "text-muted-foreground",
                testId: "stat-urgent",
              },
              {
                label: "Approved",
                value: isLoading ? null : encounters.filter(e => e.status === "approved" || e.status === "reviewed").length,
                icon: CheckCircle,
                color: "text-green-600",
                testId: "stat-approved",
              },
              {
                label: "Total Cases",
                value: isLoading ? null : encounters.length,
                icon: ClipboardList,
                color: "text-blue-600",
                testId: "stat-total",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 px-4 py-3 border-r last:border-r-0"
                data-testid={stat.testId}
              >
                <stat.icon className={`w-4 h-4 flex-shrink-0 ${stat.color}`} />
                <div>
                  {isLoading ? (
                    <Skeleton className="h-5 w-8 mb-0.5" />
                  ) : (
                    <div className={`text-lg font-bold leading-none ${stat.color}`}>{stat.value}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          <main className="flex-1 overflow-hidden flex">
            <div className={`flex-1 overflow-auto ${selectedEncounterId ? "hidden lg:block lg:w-1/2 lg:border-r" : ""}`}>
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (
                <PatientQueue 
                  encounters={encounters} 
                  filter={filter}
                  selectedId={selectedEncounterId}
                  onSelect={setSelectedEncounterId}
                />
              )}
            </div>

            {selectedEncounterId && (
              <div className="flex-1 lg:w-1/2 overflow-auto">
                <CaseDetail 
                  encounterId={selectedEncounterId} 
                  physicianId={1}
                  onClose={() => setSelectedEncounterId(null)}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
