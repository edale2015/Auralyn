import { Redirect } from "wouter";

interface Props {
  role?: "patient" | "provider" | null;
}

export default function PortalRouter({ role }: Props) {
  if (role === "patient") return <Redirect to="/portal/patient/dashboard" />;
  if (role === "provider") return <Redirect to="/ops" />;
  return <Redirect to="/login" />;
}
