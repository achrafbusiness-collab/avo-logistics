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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1e3a5f]">
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

          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            <p className="font-semibold text-gray-700">Demo-Zugaenge</p>
            <p>Admin: admin@avo-logistics.app / admin123</p>
            <p>Mitarbeiter: mitarbeiter@avo-logistics.app / mitarbeiter123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
