import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, Terminal, Building2, ShieldCheck, Mail } from "lucide-react";

const adminSections = [
  {
    title: "Verlauf",
    description: "System- und Aktivitätsverlauf einsehen.",
    page: "Verlauf",
    icon: History,
  },
  {
    title: "Terminal",
    description: "Systemlogs und Live-Ausgaben prüfen.",
    page: "Terminal",
    icon: Terminal,
  },
  {
    title: "System-Vermietung",
    description: "Mandanten verwalten und Zugänge steuern.",
    page: "SystemVermietung",
    icon: Building2,
  },
  {
    title: "E-Mail Postfach",
    description: "SMTP/IMAP Zugang für Fahrer-Bestätigungen konfigurieren.",
    page: "AdminEmailSettings",
    icon: Mail,
  },
];

export default function AdminControlling() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#1e3a5f] p-2 text-white shadow">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Controlling</h1>
            <p className="text-sm text-slate-500">
              Exklusive Admin-Bereiche für Systemsteuerung.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {adminSections.map((section) => (
          <Card key={section.page} className="border border-slate-200/80 bg-white/90">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                <section.icon className="h-5 w-5 text-[#1e3a5f]" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-500">{section.description}</p>
              <Link to={createPageUrl(section.page)}>
                <Button className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                  Öffnen
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
