import React, { useEffect, useState } from 'react';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = appClient.auth.getCurrentUser();
    if (user) {
      window.location.href = createPageUrl('Dashboard');
    }
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await appClient.auth.login({ email, password });
      window.location.href = createPageUrl('Dashboard');
    } catch (err) {
      setError(err?.message || 'Login fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.6),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.7),_transparent_60%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-10 px-4 py-12 lg:flex-row lg:gap-16">
          <div className="w-full max-w-lg space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              AVO Logistics System
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              Willkommen zur Logistik Plattform
            </h1>
            <p className="text-base text-white/70">
              Verwaltung von Auftraegen, Fahrern und Kunden an einem Ort. Sichere Anmeldung fuer
              Admins und Mitarbeiter.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/70 lg:justify-start">
              <span className="rounded-full border border-white/15 px-3 py-1">Admin-Zugang</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Mitarbeiter-Zugang</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Live Status</span>
            </div>
          </div>

          <Card className="w-full max-w-md border border-white/10 bg-white text-slate-900 shadow-2xl">
            <CardHeader className="space-y-5">
              <div className="flex items-center justify-center rounded-2xl bg-white px-6 py-5 shadow-md ring-1 ring-slate-200/70">
                <img
                  src="/Logo%20von%20AVO%20Kopie.png"
                  alt="AVO Logistics"
                  className="h-24 w-auto object-contain drop-shadow-sm"
                />
              </div>
              <CardTitle className="flex items-center justify-center gap-2 text-[#1e3a5f]">
                <Lock className="w-5 h-5" />
                Login
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@avo-logistics.app"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Passwort</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Einloggen'}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-700">Demo-Zugaenge</p>
                <p>Admin: admin@avo-logistics.app / admin123</p>
                <p>Mitarbeiter: mitarbeiter@avo-logistics.app / mitarbeiter123</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
