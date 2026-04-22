"use client";

import { DashboardProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DashboardProvider>{children}</DashboardProvider>
    </ToastProvider>
  );
}
