import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";

const EXPENSE_LABELS = {
  fuel: "Tankbeleg",
  ticket: "Ticket",
  taxi: "Taxi",
  toll: "Maut",
  additional_protocol: "Zusatzprotokoll",
  parking: "Parken",
  other: "Sonstiges",
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const isImageFile = (expense) => {
  if (!expense?.file_url) return false;
  if (expense.file_type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(expense.file_url);
};

export default function ExpensesPdf() {
  const [params] = useSearchParams();
  const checklistId = params.get("checklistId");
  const shouldPrint = params.get("print") === "1";
  const typeParam = params.get("types");
  const selectedTypes =
    typeParam && typeParam !== "all"
      ? typeParam.split(",").map((value) => value.trim()).filter(Boolean)
      : null;

  const { data: checklist } = useQuery({
    queryKey: ["expenses-checklist", checklistId],
    queryFn: async () => {
      if (!checklistId) return null;
      const list = await appClient.entities.Checklist.filter({ id: checklistId });
      return list[0] || null;
    },
    enabled: !!checklistId,
  });

  const { data: order } = useQuery({
    queryKey: ["expenses-order", checklist?.order_id],
    queryFn: async () => {
      if (!checklist?.order_id) return null;
      const list = await appClient.entities.Order.filter({ id: checklist.order_id });
      return list[0] || null;
    },
    enabled: !!checklist?.order_id,
  });

  const { data: fallbackChecklist } = useQuery({
    queryKey: ["expenses-checklist-fallback", checklist?.order_id],
    queryFn: async () => {
      if (!checklist?.order_id) return null;
      const list = await appClient.entities.Checklist.filter({ order_id: checklist.order_id });
      return list.find((item) => Array.isArray(item.expenses) && item.expenses.length) || null;
    },
    enabled: !!checklist?.order_id,
  });

  useEffect(() => {
    if (!shouldPrint || !checklist || !order) return;
    const timeout = setTimeout(() => {
      window.print();
    }, 700);
    return () => clearTimeout(timeout);
  }, [shouldPrint, checklist, order]);

  if (!checklist || !order) {
    return (
      <div style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
        Auslagen werden geladen...
      </div>
    );
  }

  const activeChecklist =
    checklist?.expenses?.length ? checklist : fallbackChecklist || checklist;
  const allExpenses = activeChecklist?.expenses || [];
  const expenses =
    selectedTypes && selectedTypes.length
      ? allExpenses.filter((expense) => selectedTypes.includes(expense?.type))
      : allExpenses;

  return (
    <div className="expenses-pdf">
      <style>{`
        .expenses-pdf { font-family: "Arial", sans-serif; color: #0f172a; padding: 24px; background: #f8fafc; }
        .pdf-page { background: white; padding: 28px; max-width: 210mm; margin: 0 auto 24px; border: 1px solid #e2e8f0; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
        .pdf-header { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
        .pdf-logo { height: 64px; }
        .pdf-title h1 { font-size: 20px; margin: 0; letter-spacing: 1px; }
        .pdf-subtitle { font-size: 12px; color: #475569; margin-top: 6px; }
        .pdf-meta { margin-top: 14px; font-size: 12px; color: #334155; display: grid; gap: 6px; }
        .pdf-list { margin-top: 18px; display: grid; gap: 12px; }
        .expense-card { border: 1px solid #cbd5f5; border-radius: 12px; padding: 12px; background: #f8fafc; }
        .expense-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
        .expense-note { font-size: 11px; color: #475569; margin-top: 6px; white-space: pre-wrap; }
        .expense-file { margin-top: 10px; }
        .expense-file img { width: 100%; max-height: 360px; object-fit: contain; border-radius: 10px; background: #fff; border: 1px solid #e2e8f0; }
        .pdf-actions { max-width: 980px; margin: 0 auto 16px; display: flex; gap: 12px; }
        .pdf-button { background: #1e3a5f; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
        .pdf-button.secondary { background: #e2e8f0; color: #0f172a; }
        @page { size: A4; margin: 10mm; }
        @media print {
          .pdf-actions { display: none; }
          .expenses-pdf { background: white; padding: 0; }
          .pdf-page { box-shadow: none; border: none; margin: 0; width: 210mm; min-height: 297mm; padding: 6mm 8mm; }
        }
      `}</style>

      <div className="pdf-actions">
        <button className="pdf-button" onClick={() => window.print()}>
          PDF herunterladen
        </button>
        <button className="pdf-button secondary" onClick={() => window.history.back()}>
          Zurück
        </button>
      </div>

      <div className="pdf-page">
        <div className="pdf-header">
          <img className="pdf-logo" src="/IMG_5222.JPG" alt="AVO Logistics" />
          <div className="pdf-title">
            <h1>Auslagenübersicht</h1>
            <div className="pdf-subtitle">{order.order_number || "-"} • {order.license_plate || "-"}</div>
          </div>
        </div>

        <div className="pdf-meta">
          <div>Fahrer: {activeChecklist?.driver_name || "-"}</div>
          <div>Datum: {formatDateTime(activeChecklist?.datetime)}</div>
          <div>Auftrag: {order.customer_name || "-"}</div>
        </div>

        <div className="pdf-list">
          {expenses.length === 0 && (
            <div className="expense-card">Keine Auslagen erfasst.</div>
          )}
          {expenses.map((expense, index) => (
            <div key={`${expense.type}-${index}`} className="expense-card">
              <div className="expense-head">
                <span>{EXPENSE_LABELS[expense.type] || "Auslage"}</span>
                <span>{expense.amount ? `${expense.amount} €` : "-"}</span>
              </div>
              {expense.note && <div className="expense-note">{expense.note}</div>}
              {expense.file_url && (
                <div className="expense-file">
                  {isImageFile(expense) ? (
                    <img src={expense.file_url} alt={expense.file_name || "Beleg"} />
                  ) : (
                    <a href={expense.file_url} target="_blank" rel="noreferrer">
                      {expense.file_name || "Beleg öffnen"}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
