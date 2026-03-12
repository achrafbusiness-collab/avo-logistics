import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordWithConfirmSchema, emailSchema } from "@/lib/schemas";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Lock, Loader2, Mail } from "lucide-react";
import { Link } from "react-router-dom";

const getPublicResetUrl = () => {
  const envUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || "").trim();
  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/reset-password`;
  }
  return `${window.location.origin}/reset-password`;
};

export default function ResetPassword() {
  const [hasSession, setHasSession] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordWithConfirmSchema),
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || "");
    const queryEmail = params.get("email") || "";
    const token = params.get("token") || "";
    const type = params.get("type") || "";
    if (queryEmail) {
      emailForm.setValue("email", queryEmail);
    }

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session || null;
      setHasSession(!!session);
      if (session?.user?.email) {
        emailForm.setValue("email", (prev) => prev || session.user.email || "");
      }
    };

    const verifyToken = async () => {
      if (!token || !type || !queryEmail) return;
      setVerifying(true);
      setError("");
      try {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email: queryEmail,
          token,
          type,
        });
        if (verifyError) {
          throw new Error(verifyError.message || "Link ist ungültig oder abgelaufen.");
        }
        if (data?.session) {
          setHasSession(true);
          window.history.replaceState({}, document.title, "/reset-password");
        }
      } catch (err) {
        setError(err?.message || "Link ist ungültig oder abgelaufen.");
      } finally {
        setVerifying(false);
      }
    };

    loadSession();
    verifyToken();

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
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    if (!sessionUser?.id) return;
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, email, company_id, is_active")
      .eq("id", sessionUser.id)
      .maybeSingle();

    await supabase
      .from("profiles")
      .update({
        must_reset_password: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionUser.id);

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

  const handleSendReset = async (data) => {
    setError("");
    setMessage("");
    setSending(true);
    try {
      const response = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: data.email.trim(),
          purpose: "recovery",
          redirectTo: getPublicResetUrl(),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Passwort-Reset muss von einem Admin freigegeben werden. Bitte Disponenten kontaktieren."
          );
        }
        throw new Error(payload?.error || "Reset fehlgeschlagen.");
      }
      setMessage("Falls die E-Mail existiert, wurde ein Reset-Link gesendet.");
    } catch (err) {
      setError(err?.message || "Reset fehlgeschlagen.");
    } finally {
      setSending(false);
    }
  };

  const handleSetPassword = async (data) => {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await supabase.auth.updateUser({ password: data.password });
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
          <div className="flex justify-center">
            <Button asChild variant="ghost" className="text-slate-600 hover:text-slate-900">
              <Link to="/login">Zurück zum Login</Link>
            </Button>
          </div>
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

          {verifying ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Link wird geprüft...
            </div>
          ) : hasSession ? (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(handleSetPassword)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Neues Passwort</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" placeholder="Mindestens 8 Zeichen" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Neues Passwort bestätigen</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit(handleSendReset)} className="space-y-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Mail Adresse</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="name@firma.de" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={sending}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                  Reset-Link senden
                </Button>
                <p className="text-xs text-slate-500">
                  Der Reset-Link wird vom Admin freigegeben. Bitte Disponenten kontaktieren.
                </p>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
