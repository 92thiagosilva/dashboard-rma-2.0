import { Sidebar } from "@/components/layout/Sidebar";
import { EstoqueView } from "@/components/estoque/EstoqueView";

export default function EstoquePage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <EstoqueView />
      </main>
    </div>
  );
}
