import React from "react";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LifeBuoy,
  Phone,
  Mail,
  MessageCircle,
  BookOpen,
  Info,
  Shield,
} from "lucide-react";

const faqItems = [
  {
    title: "Wie starte ich ein Protokoll?",
    body: "Auftrag oeffnen -> Protokoll starten -> Fotos, Checkliste, Unterschrift speichern.",
  },
  {
    title: "Was mache ich bei Schaden?",
    body: "Schaden markieren, Foto aufnehmen und Notiz im Protokoll hinterlegen.",
  },
  {
    title: "Dokumente fehlen?",
    body: "Bitte den Disponenten informieren. Dokumente werden zentral freigegeben.",
  },
];

export default function DriverSupport() {
  const { data: appSettingsList = [] } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => appClient.entities.AppSettings.list("-created_date", 1),
  });

  const appSettings = appSettingsList[0] || null;
  const supportPhone = appSettings?.support_phone || "";
  const supportEmail = appSettings?.support_email || "";
  const emergencyPhone = appSettings?.emergency_phone || "";
  const whatsappNumber = supportPhone.replace(/[^\d]/g, "");

  return (
    <div className="p-4 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500">Hilfe, Kontakte und Infos fuer unterwegs.</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <LifeBuoy className="h-5 w-5 text-[#1e3a5f]" />
            <h2 className="text-base font-semibold">Kontakt</h2>
          </div>
          <div className="grid gap-3 text-sm text-slate-600">
            {supportPhone && (
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={() => (window.location.href = `tel:${supportPhone}`)}
              >
                <Phone className="h-4 w-4" />
                Support: {supportPhone}
              </Button>
            )}
            {supportEmail && (
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={() => (window.location.href = `mailto:${supportEmail}`)}
              >
                <Mail className="h-4 w-4" />
                {supportEmail}
              </Button>
            )}
            {whatsappNumber && (
              <Button
                variant="outline"
                className="justify-start gap-2"
                onClick={() => window.open(`https://wa.me/${whatsappNumber}`, "_blank")}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp Support
              </Button>
            )}
            {emergencyPhone && (
              <Button
                className="justify-start gap-2 bg-red-600 hover:bg-red-700"
                onClick={() => (window.location.href = `tel:${emergencyPhone}`)}
              >
                <Phone className="h-4 w-4" />
                Notfall: {emergencyPhone}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-2 text-slate-700">
            <BookOpen className="h-5 w-5 text-[#1e3a5f]" />
            <h2 className="text-base font-semibold">Anleitung</h2>
          </div>
          <p className="whitespace-pre-wrap">
            {appSettings?.instructions || "Halte dich an die Anweisungen deines Disponenten."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4 text-sm text-slate-600">
          <div className="flex items-center gap-2 text-slate-700">
            <Info className="h-5 w-5 text-[#1e3a5f]" />
            <h2 className="text-base font-semibold">FAQ</h2>
          </div>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm text-slate-600">
          <div className="flex items-center gap-2 text-slate-700">
            <Shield className="h-5 w-5 text-[#1e3a5f]" />
            <h2 className="text-base font-semibold">App-Infos</h2>
          </div>
          <div className="space-y-2">
            <p>Version: {appSettings?.app_version || "1.0.0"}</p>
            {appSettings?.office_hours && <p>Servicezeiten: {appSettings.office_hours}</p>}
            {appSettings?.office_address && <p>Adresse: {appSettings.office_address}</p>}
          </div>
          {appSettings?.legal_text && (
            <p className="text-xs text-slate-500 whitespace-pre-wrap">
              {appSettings.legal_text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
