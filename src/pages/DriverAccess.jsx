import React, { useEffect, useState } from 'react';
import { appClient } from '@/api/appClient';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, Mail } from 'lucide-react';

export default function DriverAccess() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const user = await appClient.auth.getCurrentUser();
      if (user) {
        window.location.href = createPageUrl('DriverOrders');
      }
    };
    loadUser();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResetSent(false);
    setSubmitting(true);
    try {
      await appClient.auth.login({ email, password });
      window.location.href = createPageUrl('DriverOrders');
    } catch (err) {
      setError(err?.message || 'Login fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Bitte E-Mail eingeben, um das Passwort zurückzusetzen.');
      return;
    }
    setError('');
    setResetSent(false);
    try {
      await appClient.auth.resetPassword({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setResetSent(true);
    } catch (err) {
      setError(err?.message || 'Passwort-Reset fehlgeschlagen.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.6),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.7),_transparent_60%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-10 px-4 py-12">
          <div className="w-full max-w-xl space-y-4 text-center">
            <div className="mx-auto flex items-center justify-center rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/70">
              <img
                src="/IMG_5222.JPG"
                alt="AVO Fahrer-App"
                className="h-28 w-auto object-contain drop-shadow-sm sm:h-36"
              />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              Fahrer-Portal
            </h1>
            <p className="text-base text-white/70">
              Bitte melde dich an, um deine Aufträge zu sehen und Protokolle zu erstellen.
            </p>
          </div>

          <Card className="w-full max-w-md border border-white/10 bg-white text-slate-900 shadow-2xl">
            <CardHeader className="space-y-4">
              <CardTitle className="flex items-center justify-center gap-2 text-[#1e3a5f]">
                <Lock className="w-5 h-5" />
                Fahrer-Login
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="driver-email">E-Mail</Label>
                  <Input
                    id="driver-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="fahrer@avo-logistics.app"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver-password">Passwort</Label>
                  <Input
                    id="driver-password"
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
                {resetSent && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Passwort-Link wurde gesendet. Bitte E-Mail prüfen.
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Einloggen'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleReset}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Passwort vergessen?
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-700">Hinweis</p>
                <p>Bei Problemen bitte an den Administrator wenden.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
