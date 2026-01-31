import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, Mail } from "lucide-react";

const getPublicResetUrl = () => {
  const envUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || "").trim();
  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/reset-password`;
  }
  return `${window.location.origin}/reset-password`;
};

const validatePassword = (value) => {
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSpecial = /[^A-Za-z0-9]/.test(value);
  if (!value || value.length < 8 || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
    return "Passwort muss mindestens 8 Zeichen haben und Großbuchstaben, Kleinbuchstaben, Zahl und Sonderzeichen enthalten.";
  }
  return "";
};

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const queryEmail = params.get("email") || "";
    if (queryEmail) {
      setEmail((prev) => prev || queryEmail);
    }
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session || null;
      setHasSession(!!session);
      if (session?.user?.email) {
        setEmail((prev) => prev || session.user.email || "");
      }
    };
    loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const sendWelcomeEmail = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    await fetch("/api/admin/send-driver-assignment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ welcomeEmail: true }),
    });
  };

  const activateProfile = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return;
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, email, company_id, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    await supabase
      .from("profiles")
      .update({
        must_reset_password: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userData.user.id);

    if (profileData?.role === "driver" && profileData?.email) {
      await supabase
        .from("drivers")
        .update({ status: "active" })
        .eq("email", profileData.email)
        .eq("company_id", profileData.company_id || null);
      return;
    }

    if (profileData?.is_active === false) {
      try {
        await sendWelcomeEmail();
      } catch (err) {
        console.warn("Welcome email failed", err);
      }
    }
  };

  const handleSendReset = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Bitte E-Mail-Adresse eingeben.");
      return;
    }
    setSending(true);
    try {
      await appClient.auth.resetPassword({
        email,
        redirectTo: getPublicResetUrl(),
      });
      setMessage("E-Mail gesendet. Bitte Link in der E-Mail öffnen.");
    } catch (err) {
      setError(err?.message || "Reset fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  };

  const handleSetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const validation = validatePassword(password);
    if (validation) {
      setError(validation);
      return;
    }
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    setSaving(true);
    try {
      await appClient.auth.updatePassword({ password });
      await activateProfile();
      setMessage("Passwort gespeichert. Bitte jetzt einloggen.");
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
            Passwort vergessen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {message && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {hasSession ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Neues Passwort</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">E-Mail Adresse</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@firma.de"
                />
              </div>
              <Button
                type="button"
                className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                onClick={handleSendReset}
                disabled={sending}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Reset-Link senden
              </Button>
              <p className="text-xs text-slate-500">
                Du erhältst eine E-Mail zur Freigabe. Nach dem Klick erscheinen die Passwort-Felder.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
