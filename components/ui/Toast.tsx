"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle, Warning, X, Info } from "@phosphor-icons/react";

type ToastType = "success" | "error" | "warning" | "info";
interface ToastItem { id: number; message: string; type: ToastType }

const ToastContext = createContext<{ show: (msg: string, type?: ToastType) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((i) => i.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-xs border-l-4 animate-slide-up"
            style={{
              borderLeftColor:
                t.type === "success" ? "#10b981"
                : t.type === "error" ? "#ef4444"
                : t.type === "warning" ? "#f59e0b"
                : "#3b82f6",
            }}
          >
            {t.type === "success" && <CheckCircle size={16} weight="fill" className="text-emerald-400 shrink-0" />}
            {t.type === "error" && <Warning size={16} weight="fill" className="text-red-400 shrink-0" />}
            {t.type === "warning" && <Warning size={16} weight="fill" className="text-amber-400 shrink-0" />}
            {t.type === "info" && <Info size={16} weight="fill" className="text-blue-400 shrink-0" />}
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
