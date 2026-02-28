import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Users, Briefcase } from 'lucide-react';

export default function Login() {
  useEffect(() => {
    const loadUser = async () => {
      const user = await appClient.auth.getCurrentUser();
      if (user) {
        window.location.href = createPageUrl('Dashboard');
      }
    };
    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.6),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.7),_transparent_60%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-10 px-4 py-12">
          <div className="w-full max-w-2xl space-y-6 text-center">
            <div className="mx-auto flex items-center justify-center rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/70">
              <img
                src="/logo.png"
                alt="AVO SYSTEMS"
                className="h-36 w-auto object-contain drop-shadow-sm sm:h-44"
              />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              AVO SYSTEMS Zugang
            </h1>
            <p className="text-base text-white/70">
              Bitte wähle dein Portal, um dich anzumelden.
            </p>
          </div>

          <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="border border-white/10 bg-white text-slate-900 shadow-2xl">
              <CardHeader className="space-y-2">
                <div className="flex items-center gap-2 text-[#1e3a5f]">
                  <Truck className="h-5 w-5" />
                  <CardTitle>Fahrer‑Portal</CardTitle>
                </div>
                <p className="text-sm text-slate-600">
                  Zugriff für Fahrer mit Touren, Protokollen und Aufgaben.
                </p>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                  <Link to="/login/driver">Zum Fahrer‑Login</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white text-slate-900 shadow-2xl">
              <CardHeader className="space-y-2">
                <div className="flex items-center gap-2 text-[#1e3a5f]">
                  <Users className="h-5 w-5" />
                  <CardTitle>Mitarbeiter‑Portal</CardTitle>
                </div>
                <p className="text-sm text-slate-600">
                  Disposition, Aufträge, Kunden und Fahrer verwalten.
                </p>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                  <Link to="/login/staff">Zum Mitarbeiter‑Login</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white text-slate-900 shadow-2xl">
              <CardHeader className="space-y-2">
                <div className="flex items-center gap-2 text-[#1e3a5f]">
                  <Briefcase className="h-5 w-5" />
                  <CardTitle>Geschäftsführung</CardTitle>
                </div>
                <p className="text-sm text-slate-600">
                  Zugriff für Geschäftsführung & Buchhaltung.
                </p>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                  <Link to="/login/executive">Zum Geschäftsführung‑Login</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/70">
            <span className="rounded-full border border-white/15 px-3 py-1">Ein Login‑Flow</span>
            <span className="rounded-full border border-white/15 px-3 py-1">Rollen steuern Rechte</span>
            <span className="rounded-full border border-white/15 px-3 py-1">Sicherer Zugriff</span>
          </div>
        </div>
      </div>
    </div>
  );
}
