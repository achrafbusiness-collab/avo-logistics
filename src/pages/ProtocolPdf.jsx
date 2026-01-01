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

const labelForLighting = (value) => {
  if (!value) return "-";
  if (value === "dark") return "Dunkel";
  return "Hell";
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

const DAMAGE_POINTS = [
  { id: 'front-left', boxX: 10, boxY: 12, targetX: 32, targetY: 32 },
  { id: 'front-right', boxX: 90, boxY: 12, targetX: 68, targetY: 32 },
  { id: 'hood', boxX: 50, boxY: 6, targetX: 50, targetY: 26 },
  { id: 'roof', boxX: 50, boxY: 22, targetX: 50, targetY: 42 },
  { id: 'left-side', boxX: 10, boxY: 50, targetX: 32, targetY: 50 },
  { id: 'right-side', boxX: 90, boxY: 50, targetX: 68, targetY: 50 },
  { id: 'rear-left', boxX: 10, boxY: 88, targetX: 32, targetY: 66 },
  { id: 'rear-right', boxX: 90, boxY: 88, targetX: 68, targetY: 66 },
  { id: 'trunk', boxX: 50, boxY: 94, targetX: 50, targetY: 72 },
  { id: 'glass', boxX: 50, boxY: 32, targetX: 50, targetY: 50 },
];

const pickLatestChecklist = (items, type) => {
  const list = (items || []).filter((item) => item?.type === type);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const aTime = new Date(a.datetime || 0).getTime();
    const bTime = new Date(b.datetime || 0).getTime();
    return bTime - aTime;
  })[0];
};

const buildAccessories = (checklist) => {
  const selected = checklist?.accessories || {};
  return accessories.map((item) => ({
    ...item,
    checked: Boolean(selected[item.key]),
  }));
};

const formatAddress = (address, postalCode, city) => {
  const line = [postalCode, city].filter(Boolean).join(" ");
  return [address, line].filter(Boolean).join("\n");
};

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

  const { data: orderChecklists } = useQuery({
    queryKey: ["order-checklists-pdf", checklist?.order_id],
    queryFn: async () => {
      if (!checklist?.order_id) return [];
      const list = await appClient.entities.Checklist.filter({ order_id: checklist.order_id });
      return list || [];
    },
    enabled: !!checklist?.order_id,
  });

  const pickupChecklist = useMemo(() => {
    return (
      pickLatestChecklist(orderChecklists, "pickup") ||
      (checklist?.type === "pickup" ? checklist : null)
    );
  }, [orderChecklists, checklist]);

  const dropoffChecklist = useMemo(() => {
    return (
      pickLatestChecklist(orderChecklists, "dropoff") ||
      (checklist?.type === "dropoff" ? checklist : null)
    );
  }, [orderChecklists, checklist]);

  const pickupAccessories = useMemo(() => buildAccessories(pickupChecklist), [pickupChecklist]);

  const pickupPhotos = pickupChecklist?.photos || [];
  const dropoffPhotos = dropoffChecklist?.photos || [];
  const dropoffSignatureRefused = Boolean(dropoffChecklist?.signature_refused);
  const pickupDamages = pickupChecklist?.damages || [];
  const damageRows = Array.from({ length: 5 }, (_, index) => pickupDamages[index] || null);
  const extraDamageCount = Math.max(0, pickupDamages.length - damageRows.length);
  useEffect(() => {
    if (!shouldPrint || !checklist || !order || typeof orderChecklists === "undefined") return;
    const timeout = setTimeout(() => {
      window.print();
    }, 900);
    return () => clearTimeout(timeout);
  }, [shouldPrint, checklist, order, orderChecklists]);

  if (!checklist || !order) {
    return (
      <div style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
        Protokoll wird geladen...
      </div>
    );
  }

  const orderNumber = order.order_number || "-";
  const orderVehicle = `${order.vehicle_brand || ""} ${order.vehicle_model || ""}`.trim();
  const pickupAddress = formatAddress(
    order.pickup_address,
    order.pickup_postal_code,
    order.pickup_city
  );
  const dropoffAddress = formatAddress(
    order.dropoff_address,
    order.dropoff_postal_code,
    order.dropoff_city
  );

  return (
    <div className="protocol-pdf">
      <style>{`
        .protocol-pdf { font-family: "Arial", sans-serif; color: #0f172a; padding: 24px; background: #f8fafc; }
        .pdf-page { background: white; padding: 28px; max-width: 210mm; margin: 0 auto 24px; border: 1px solid #e2e8f0; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
        .pdf-header { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
        .pdf-logo { height: 72px; }
        .pdf-title { text-align: center; }
        .pdf-title h1 { font-size: 22px; margin: 0; letter-spacing: 1.4px; }
        .pdf-subtitle { font-size: 12px; color: #475569; margin-top: 6px; }
        .pdf-marks { display: grid; gap: 6px; justify-items: end; }
        .pdf-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #1e293b; }
        .pdf-check span { display: inline-flex; width: 14px; height: 14px; border: 1px solid #334155; align-items: center; justify-content: center; font-size: 10px; }
        .pdf-section { margin-top: 18px; }
        .pdf-meta-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-box { border: 1px solid #cbd5f5; padding: 10px 12px; border-radius: 10px; background: #f8fafc; font-size: 12px; }
        .pdf-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .08em; }
        .pdf-value { font-weight: 600; margin-top: 4px; white-space: pre-wrap; }
        .pdf-muted { margin-top: 6px; font-size: 11px; color: #475569; }
        .pdf-protocol-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
        .pdf-protocol-column { border: 1px solid #dbeafe; border-radius: 14px; padding: 14px; background: #f8fafc; }
        .pdf-protocol-column h2 { margin: 0 0 10px; font-size: 16px; color: #1e3a5f; }
        .pdf-field { margin-bottom: 10px; }
        .pdf-field-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
        .pdf-field-value { margin-top: 4px; font-weight: 600; font-size: 12px; white-space: pre-wrap; }
        .pdf-mini-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-mini-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .pdf-accessories { display: grid; gap: 6px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-accessory { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #334155; }
        .pdf-accessory span { display: inline-flex; width: 12px; height: 12px; border: 1px solid #334155; align-items: center; justify-content: center; font-size: 10px; }
        .pdf-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
        .pdf-table th, .pdf-table td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
        .pdf-note { font-size: 11px; color: #475569; margin-top: 6px; white-space: pre-wrap; }
        .pdf-signatures { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
        .pdf-signature-box { border: 1px dashed #94a3b8; padding: 8px; border-radius: 10px; min-height: 90px; background: white; }
        .pdf-signature-box img { max-width: 100%; max-height: 70px; display: block; }
        .pdf-signature-placeholder { height: 70px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 11px; border: 1px dashed #e2e8f0; border-radius: 8px; }
        .pdf-photos { margin-top: 22px; }
        .pdf-photo-section { margin-top: 16px; }
        .pdf-photo-section h3 { margin: 0 0 10px; font-size: 14px; color: #1e3a5f; }
        .pdf-sketch { position: relative; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; overflow: hidden; margin-top: 8px; }
        .pdf-sketch img { width: 100%; display: block; }
        .pdf-damage-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: start; }
        .pdf-sketch.compact { margin-top: 0; height: 150px; }
        .pdf-sketch.compact img { height: 150px; object-fit: contain; }
        .pdf-sketch-marker { position: absolute; width: 16px; height: 16px; border: 1px solid #0f172a; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #1e3a5f; }
        .pdf-photo-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pdf-photo-card { border: 1px solid #e2e8f0; padding: 8px; border-radius: 12px; background: white; }
        .pdf-photo-card img { width: 100%; height: 260px; object-fit: contain; border-radius: 8px; background: #f8fafc; }
        .pdf-photo-caption { margin-top: 6px; font-size: 11px; color: #334155; }
        .pdf-divider { height: 1px; background: #e2e8f0; margin: 18px 0; }
        .pdf-actions { max-width: 980px; margin: 0 auto 16px; display: flex; gap: 12px; }
        .pdf-button { background: #1e3a5f; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; }
        .pdf-button.secondary { background: #e2e8f0; color: #0f172a; }
        .pdf-photo-page { page-break-before: always; }
        .pdf-protocol-page { page-break-after: always; min-height: 297mm; }
        @page { size: A4; margin: 10mm; }
        @media print {
          .pdf-actions { display: none; }
          .protocol-pdf { background: white; padding: 0; }
          .pdf-page { box-shadow: none; border: none; margin: 0; width: 210mm; min-height: 297mm; padding: 6mm 8mm; }
          .pdf-header { padding-bottom: 6mm; }
          .pdf-logo { height: 72px; }
          .pdf-title h1 { font-size: 20px; }
          .pdf-subtitle { font-size: 12px; }
          .pdf-protocol-column h2 { font-size: 15px; }
          .pdf-box { font-size: 12px; }
          .pdf-field-value { font-size: 12px; }
          .pdf-photo-grid { gap: 6mm; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .pdf-photo-card img { height: 260px; object-fit: contain; }
          .pdf-sketch.compact { height: 135px; }
          .pdf-sketch.compact img { height: 135px; }
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

      <div className="pdf-page pdf-protocol-page">
        <div className="pdf-header">
          <img className="pdf-logo" src="/IMG_5222.JPG" alt="AVO Logistics" />
          <div className="pdf-title">
            <h1>FAHRZEUGPROTOKOLL</h1>
            <div className="pdf-subtitle">{orderNumber} • {order.license_plate || "-"}</div>
          </div>
          <div className="pdf-marks">
            <div className="pdf-check">
              <span>{pickupChecklist ? "✓" : ""}</span> Auslieferung
            </div>
            <div className="pdf-check">
              <span>{dropoffChecklist ? "✓" : ""}</span> Rückholung
            </div>
          </div>
        </div>

        <div className="pdf-section pdf-meta-grid">
          <div className="pdf-box">
            <div className="pdf-label">Fahrzeug</div>
            <div className="pdf-value">{orderVehicle || "-"}</div>
            <div className="pdf-muted">
              Kennzeichen: {order.license_plate || "-"}{"\n"}
              FIN: {order.vin || "-"}{"\n"}
              Farbe: {order.vehicle_color || "-"}
            </div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Kunde</div>
            <div className="pdf-value">{order.customer_name || "-"}</div>
            <div className="pdf-muted">
              E-Mail: {order.customer_email || "-"}{"\n"}
              Telefon: {order.customer_phone || "-"}
            </div>
          </div>
        </div>

        <div className="pdf-section pdf-meta-grid">
          <div className="pdf-box">
            <div className="pdf-label">Adresse Abholung</div>
            <div className="pdf-value">{pickupAddress || "-"}</div>
          </div>
          <div className="pdf-box">
            <div className="pdf-label">Adresse Abgabe</div>
            <div className="pdf-value">{dropoffAddress || "-"}</div>
          </div>
        </div>

        <div className="pdf-protocol-grid">
          <div className="pdf-protocol-column">
            <h2>Übernahme</h2>
            <div className="pdf-mini-grid">
              <div className="pdf-field">
                <div className="pdf-field-label">Datum & Uhrzeit</div>
                <div className="pdf-field-value">{formatDateTime(pickupChecklist?.datetime)}</div>
              </div>
              <div className="pdf-field">
                <div className="pdf-field-label">Fahrer</div>
                <div className="pdf-field-value">{pickupChecklist?.driver_name || "-"}</div>
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Ort</div>
              <div className="pdf-field-value">{pickupChecklist?.location || pickupAddress || "-"}</div>
            </div>
            <div className="pdf-mini-grid three">
              <div className="pdf-field">
                <div className="pdf-field-label">Kilometerstand</div>
                <div className="pdf-field-value">{pickupChecklist?.kilometer || "-"} km</div>
              </div>
              <div className="pdf-field">
                <div className="pdf-field-label">Tankstand</div>
                <div className="pdf-field-value">{labelForFuel(pickupChecklist?.fuel_level)}</div>
              </div>
              <div className="pdf-field">
                <div className="pdf-field-label">Innen/Außen</div>
                <div className="pdf-field-value">
                  {pickupChecklist?.cleanliness_inside || "-"} / {pickupChecklist?.cleanliness_outside || "-"}
                </div>
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Lichtverhältnisse</div>
              <div className="pdf-field-value">{labelForLighting(pickupChecklist?.lighting)}</div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Fahrzeugzubehör</div>
              <div className="pdf-accessories">
                {pickupAccessories.map((item) => (
                  <span key={item.key} className="pdf-accessory">
                    <span>{item.checked ? "✓" : ""}</span>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Schäden / Bemerkungen</div>
              <div className="pdf-damage-grid">
                <div className="pdf-sketch compact">
                  <img src="/PHOTO-2025-12-30-13-15-46.jpg" alt="Fahrzeugskizze" />
                  {DAMAGE_POINTS.map((point) => {
                    const damage = pickupChecklist?.damages?.find((item) => item.slot_id === point.id);
                    if (!damage?.type) return null;
                    return (
                      <div
                        key={point.id}
                        className="pdf-sketch-marker"
                        style={{ left: `${point.boxX}%`, top: `${point.boxY}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        {damage.type}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <table className="pdf-table">
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Typ</th>
                        <th>Beschreibung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damageRows.map((damage, index) => (
                        <tr key={`damage-row-${index}`}>
                          <td>{damage?.location || ""}</td>
                          <td>{damage?.type || ""}</td>
                          <td>{damage?.description || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!pickupChecklist?.damages?.length && (
                    <div className="pdf-note">Keine Schäden dokumentiert.</div>
                  )}
                  {extraDamageCount > 0 && (
                    <div className="pdf-note">{`Weitere Schäden: ${extraDamageCount}`}</div>
                  )}
                </div>
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Notizen</div>
              <div className="pdf-note">{pickupChecklist?.notes || "-"}</div>
            </div>
            <div className="pdf-signatures">
              <div className="pdf-signature-box">
                <div className="pdf-field-label">Unterschrift Fahrer</div>
                {pickupChecklist?.signature_driver ? (
                  <img src={pickupChecklist.signature_driver} alt="Unterschrift Fahrer" />
                ) : (
                  <div className="pdf-signature-placeholder">Nicht vorhanden</div>
                )}
              </div>
              <div className="pdf-signature-box">
                <div className="pdf-field-label">Unterschrift Kunde</div>
                {pickupChecklist?.signature_customer ? (
                  <img src={pickupChecklist.signature_customer} alt="Unterschrift Kunde" />
                ) : (
                  <div className="pdf-signature-placeholder">Nicht vorhanden</div>
                )}
                <div className="pdf-note">{pickupChecklist?.customer_name || order.customer_name || "-"}</div>
              </div>
            </div>
          </div>

          <div className="pdf-protocol-column">
            <h2>Übergabe</h2>
            <div className="pdf-mini-grid">
              <div className="pdf-field">
                <div className="pdf-field-label">Datum & Uhrzeit</div>
                <div className="pdf-field-value">{formatDateTime(dropoffChecklist?.datetime)}</div>
              </div>
              <div className="pdf-field">
                <div className="pdf-field-label">Fahrer</div>
                <div className="pdf-field-value">{dropoffChecklist?.driver_name || "-"}</div>
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Ort</div>
              <div className="pdf-field-value">{dropoffChecklist?.location || dropoffAddress || "-"}</div>
            </div>
            <div className="pdf-mini-grid three">
              <div className="pdf-field">
                <div className="pdf-field-label">Kilometerstand</div>
                <div className="pdf-field-value">{dropoffChecklist?.kilometer || "-"} km</div>
              </div>
              <div className="pdf-field">
                <div className="pdf-field-label">Tankstand</div>
                <div className="pdf-field-value">{labelForFuel(dropoffChecklist?.fuel_level)}</div>
              </div>
              <div className="pdf-field">
                <div className="pdf-field-label">Innen/Außen</div>
                <div className="pdf-field-value">
                  {dropoffChecklist?.cleanliness_inside || "-"} / {dropoffChecklist?.cleanliness_outside || "-"}
                </div>
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Lichtverhältnisse</div>
              <div className="pdf-field-value">{labelForLighting(dropoffChecklist?.lighting)}</div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Tankkosten</div>
              <div className="pdf-field-value">
                {dropoffChecklist?.fuel_cost !== null && dropoffChecklist?.fuel_cost !== undefined
                  ? `${dropoffChecklist.fuel_cost} €`
                  : "-"}
              </div>
            </div>
            <div className="pdf-field">
              <div className="pdf-field-label">Notizen</div>
              <div className="pdf-note">{dropoffChecklist?.notes || "-"}</div>
            </div>
            <div className="pdf-signatures">
              <div className="pdf-signature-box">
                <div className="pdf-field-label">Unterschrift Fahrer</div>
                {dropoffChecklist?.signature_driver ? (
                  <img src={dropoffChecklist.signature_driver} alt="Unterschrift Fahrer" />
                ) : (
                  <div className="pdf-signature-placeholder">Nicht vorhanden</div>
                )}
              </div>
              <div className="pdf-signature-box">
                <div className="pdf-field-label">Unterschrift Kunde</div>
                {dropoffSignatureRefused ? (
                  <div className="pdf-signature-placeholder">Unterschrift verweigert</div>
                ) : dropoffChecklist?.signature_customer ? (
                  <img src={dropoffChecklist.signature_customer} alt="Unterschrift Kunde" />
                ) : (
                  <div className="pdf-signature-placeholder">Nicht vorhanden</div>
                )}
                <div className="pdf-note">
                  {dropoffSignatureRefused
                    ? `Verweigert von: ${dropoffChecklist?.signature_refused_by || "-"}\nGrund: ${dropoffChecklist?.signature_refused_reason || "-"}`
                    : dropoffChecklist?.customer_name || order.customer_name || "-"}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="pdf-page pdf-photo-page">
        <div className="pdf-photo-section">
          <h3>Übernahme Bilder</h3>
          {pickupPhotos.length ? (
            <div className="pdf-photo-grid">
              {pickupPhotos.map((photo, index) => (
                <div key={`${photo.type}-${index}`} className="pdf-photo-card">
                  <img src={photo.url} alt={photo.caption || photo.type} />
                  <div className="pdf-photo-caption">{photo.caption || photo.type}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pdf-note">Keine Übernahme-Fotos vorhanden.</div>
          )}
        </div>

        <div className="pdf-divider" />

        <div className="pdf-photo-section">
          <h3>Übergabe Bilder</h3>
          {dropoffPhotos.length ? (
            <div className="pdf-photo-grid">
              {dropoffPhotos.map((photo, index) => (
                <div key={`${photo.type}-${index}`} className="pdf-photo-card">
                  <img src={photo.url} alt={photo.caption || photo.type} />
                  <div className="pdf-photo-caption">{photo.caption || photo.type}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pdf-note">Keine Übergabe-Fotos vorhanden.</div>
          )}
        </div>
      </div>
    </div>
  );
}
