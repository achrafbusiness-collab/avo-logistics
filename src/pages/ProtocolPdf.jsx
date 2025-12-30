import React, { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("de-DE");
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

const labelForFuel = (value) => {
  if (!value) return "-";
  if (value === "empty") return "0/4";
  if (value === "full") return "4/4";
  return value;
};

const accessories = [
  { key: "registration_doc", label: "Fahrzeugschein" },
  { key: "warning_triangle", label: "Warndreieck" },
  { key: "first_aid_kit", label: "Verbandskasten" },
  { key: "safety_vest", label: "Warnweste" },
  { key: "manual", label: "Betr. Anleitung" },
  { key: "service_book", label: "Serviceheft" },
  { key: "car_jack", label: "Wagenheber" },
  { key: "wheel_wrench", label: "Radschlüssel" },
  { key: "spare_wheel", label: "Ersatzrad" },
];

export default function ProtocolPdf() {
  const [params] = useSearchParams();
  const checklistId = params.get("checklistId");
  const shouldPrint = params.get("print") === "1";

  const { data: checklist } = useQuery({
    queryKey: ["checklist-pdf", checklistId],
    queryFn: async () => {
      if (!checklistId) return null;
      const list = await appClient.entities.Checklist.filter({ id: checklistId });
      return list[0] || null;
    },
    enabled: !!checklistId,
  });

  const { data: order } = useQuery({
    queryKey: ["order-pdf", checklist?.order_id],
    queryFn: async () => {
      if (!checklist?.order_id) return null;
      const list = await appClient.entities.Order.filter({ id: checklist.order_id });
      return list[0] || null;
    },
    enabled: !!checklist?.order_id,
  });

  const photos = checklist?.photos || [];
  const isPickup = checklist?.type === "pickup";
  const title = isPickup ? "Übernahmeprotokoll" : "Übergabeprotokoll";

  useEffect(() => {
    if (!shouldPrint || !checklist || !order) return;
    const timeout = setTimeout(() => {
      window.print();
    }, 900);
    return () => clearTimeout(timeout);
  }, [shouldPrint, checklist, order]);

  const accessoriesList = useMemo(() => {
    const selected = checklist?.accessories || {};
    return accessories.map((item) => ({
      ...item,
      checked: Boolean(selected[item.key]),
    }));
  }, [checklist]);

  if (!checklist || !order) {
    return (
      <div style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
        Protokoll wird geladen...
      </div>
    );
  }

  return (
    <div className="protocol-pdf">
      <style>{`
        .protocol-pdf { font-family: "Arial", sans-serif; color: #0f172a; padding: 24px; background: #f8fafc; }
        .pdf-page { background: white; padding: 24px; max-width: 900px; margin: 0 auto 24px; border: 1px solid #e2e8f0; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
        .pdf-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .pdf-logo { height: 48px; }
        .pdf-title { text-align: center; flex: 1; }
        .pdf-title h1 { font-size: 20px; margin: 0; letter-spacing: 1px; }
        .pdf-subtitle { font-size: 12px; color: #475569; margin-top: 4px; }
        .pdf-section { margin-top: 18px; }
        .pdf-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-box { border: 1px solid #cbd5f5; padding: 10px 12px; border-radius: 8px; background: #f8fafc; font-size: 13px; }
        .pdf-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
        .pdf-value { font-weight: 600; margin-top: 4px; }
        .pdf-row { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .pdf-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .pdf-table th, .pdf-table td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
        .pdf-check { display: inline-flex; align-items: center; gap: 6px; margin-right: 10px; font-size: 12px; }
        .pdf-check span { display: inline-block; width: 12px; height: 12px; border: 1px solid #334155; text-align: center; font-size: 10px; }
        .pdf-signatures { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-signature-box { border: 1px solid #cbd5f5; padding: 10px; border-radius: 8px; min-height: 110px; }
        .pdf-signature-box img { max-width: 100%; max-height: 90px; display: block; }
        .pdf-note { font-size: 12px; color: #475569; margin-top: 8px; white-space: pre-wrap; }
        .pdf-photos { margin-top: 18px; }
        .pdf-photo-page { page-break-before: always; }
        .pdf-photo-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-photo-card { border: 1px solid #e2e8f0; padding: 10px; border-radius: 12px; background: white; }
        .pdf-photo-card img { width: 100%; height: 240px; object-fit: cover; border-radius: 8px; }
        .pdf-photo-caption { margin-top: 6px; font-size: 12px; color: #334155; }
        .pdf-actions { max-width: 900px; margin: 0 auto 16px; display: flex; gap: 12px; }
        .pdf-button { background: #1e3a5f; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
        .pdf-button.secondary { background: #e2e8f0; color: #0f172a; }
        @media print {
          .pdf-actions { display: none; }
          .protocol-pdf { background: white; padding: 0; }
          .pdf-page { box-shadow: none; border: none; margin: 0; }
          .pdf-photo-card img { height: 260px; }
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
            <h1>FAHRZEUGPROTOKOLL</h1>
            <div className="pdf-subtitle">{title}</div>
          </div>
          <div>
            <div className="pdf-check">
              <span>{isPickup ? "✓" : ""}</span> Auslieferung
            </div>
            <div className="pdf-check">
              <span>{!isPickup ? "✓" : ""}</span> Rückholung
            </div>
          </div>
        </div>

        <div className="pdf-section pdf-grid">
          <div className="pdf-box">
            <div className="pdf-label">Fahrzeugtyp</div>
            <div className="pdf-value">{order.vehicle_brand} {order.vehicle_model}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Fahrername</div>
            <div className="pdf-value">{checklist.driver_name || "-"}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Kennzeichen</div>
            <div className="pdf-value">{order.license_plate || "-"}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Kundenname</div>
            <div className="pdf-value">{order.customer_name || "-"}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">FIN</div>
            <div className="pdf-value">{order.vin || "-"}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">E-Mail Kunde</div>
            <div className="pdf-value">{order.customer_email || "-"}</div>
          </div>
        </div>

        <div className="pdf-section pdf-row">
          <div className="pdf-box">
            <div className="pdf-label">Datum</div>
            <div className="pdf-value">{formatDateTime(checklist.datetime)}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Ort</div>
            <div className="pdf-value">{checklist.location || "-"}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Kilometerstand</div>
            <div className="pdf-value">{checklist.kilometer || "-"} km</div>
          </div>
        </div>

        <div className="pdf-section pdf-grid">
          <div className="pdf-box">
            <div className="pdf-label">Adresse Abholung</div>
            <div className="pdf-value">
              {order.pickup_address || "-"}<br />
              {order.pickup_postal_code} {order.pickup_city}
            </div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Adresse Abgabe</div>
            <div className="pdf-value">
              {order.dropoff_address || "-"}<br />
              {order.dropoff_postal_code} {order.dropoff_city}
            </div>
          </div>
        </div>

        <div className="pdf-section">
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Tankstand</th>
                <th>Sauberkeit innen</th>
                <th>Sauberkeit außen</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{labelForFuel(checklist.fuel_level)}</td>
                <td>{checklist.cleanliness_inside || "-"}</td>
                <td>{checklist.cleanliness_outside || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="pdf-section">
          <div className="pdf-label">Fahrzeugzubehör</div>
          <div className="pdf-grid">
            {accessoriesList.map((item) => (
              <div key={item.key} className="pdf-box">
                <span className="pdf-check">
                  <span>{item.checked ? "✓" : ""}</span>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="pdf-section">
          <div className="pdf-label">Schäden / Bemerkungen</div>
          {checklist.damages?.length ? (
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Typ</th>
                  <th>Beschreibung</th>
                </tr>
              </thead>
              <tbody>
                {checklist.damages.map((damage, index) => (
                  <tr key={`${damage.location}-${index}`}>
                    <td>{damage.location}</td>
                    <td>{damage.type || "-"}</td>
                    <td>{damage.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="pdf-note">Keine Schäden dokumentiert.</div>
          )}
        </div>

        <div className="pdf-section">
          <div className="pdf-label">Notizen</div>
          <div className="pdf-note">{checklist.notes || "-"}</div>
        </div>

        <div className="pdf-section pdf-signatures">
          <div className="pdf-signature-box">
            <div className="pdf-label">Unterschrift Fahrer</div>
            {checklist.signature_driver && (
              <img src={checklist.signature_driver} alt="Unterschrift Fahrer" />
            )}
          </div>
          <div className="pdf-signature-box">
            <div className="pdf-label">Unterschrift Kunde</div>
            {checklist.signature_customer && (
              <img src={checklist.signature_customer} alt="Unterschrift Kunde" />
            )}
            <div className="pdf-note">{checklist.customer_name || "-"}</div>
          </div>
        </div>
      </div>

      {photos.length > 0 && (
        <div className="pdf-page pdf-photo-page">
          <h2>Fotodokumentation</h2>
          <div className="pdf-photo-grid">
            {photos.map((photo, index) => (
              <div key={`${photo.type}-${index}`} className="pdf-photo-card">
                <img src={photo.url} alt={photo.caption || photo.type} />
                <div className="pdf-photo-caption">{photo.caption || photo.type}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
