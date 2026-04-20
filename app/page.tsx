import { DashboardProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "@/components/layout/Sidebar";
import { KPIGrid } from "@/components/dashboard/KPIGrid";
import { InsightsGrid } from "@/components/dashboard/InsightsGrid";
import { TimelineChart } from "@/components/dashboard/TimelineChart";
import { ModelFailureChart } from "@/components/dashboard/ModelFailureChart";
import { DefectsChart } from "@/components/dashboard/DefectsChart";
import { RegionalChart } from "@/components/dashboard/RegionalChart";
import { MTTFChart } from "@/components/dashboard/MTTFChart";
import { RMATable } from "@/components/dashboard/RMATable";

export default function DashboardPage() {
  return (
    <ToastProvider>
      <DashboardProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
            <div className="max-w-[1400px] mx-auto">
              <KPIGrid />
              <InsightsGrid />
              <div className="grid grid-cols-2 gap-4 mb-5">
                <TimelineChart />
                <ModelFailureChart />
                <DefectsChart />
                <RegionalChart />
                <MTTFChart />
              </div>
              <RMATable />
            </div>
          </main>
        </div>
      </DashboardProvider>
    </ToastProvider>
  );
}
