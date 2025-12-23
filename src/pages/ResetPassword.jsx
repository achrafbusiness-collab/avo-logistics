import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data?.session);
    };
    loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!password || password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setSaving(true);
    try {
      await appClient.auth.updatePassword({ password });
      setDone(true);
      await supabase.auth.signOut();
    } catch (err) {
      setError(err?.message || "Passwort konnte nicht gesetzt werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border border-white/10 bg-white text-slate-900 shadow-2xl">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-center gap-2 text-[#1e3a5f]">
            <Lock className="w-5 h-5" />
            Passwort festlegen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSession ? (
            <div className="text-sm text-slate-600 text-center">
              Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Reset-Link an.
            </div>
          ) : done ? (
            <div className="text-sm text-emerald-700 text-center">
              Passwort wurde gesetzt. Bitte melde dich erneut an.
              <div className="mt-4">
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={() => (window.location.href = "/login")}
                >
                  Zum Login
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Neues Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Passwort bestätigen</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Passwort setzen"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
