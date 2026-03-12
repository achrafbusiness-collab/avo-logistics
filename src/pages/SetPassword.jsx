import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordWithConfirmSchema } from "@/lib/schemas";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
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
import { Lock, Loader2 } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function SetPassword() {
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const form = useForm({
    resolver: zodResolver(passwordWithConfirmSchema),
    defaultValues: { password: "", confirm: "" },
  });

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

  const onSubmit = async (data) => {
    setError("");
    setSaving(true);
    try {
      await appClient.auth.updatePassword({ password: data.password });
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (sessionUser?.id) {
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
        } else if (profileData?.is_active === false) {
          try {
            await sendWelcomeEmail();
          } catch (err) {
            console.warn("Welcome email failed", err);
          }
        }
      }
      setDone(true);
      window.location.href = createPageUrl("Dashboard");
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
            Passwort ändern
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSession ? (
            <div className="text-sm text-slate-600 text-center">
              Bitte zuerst einloggen, um dein Passwort zu ändern.
              <div className="mt-4">
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  onClick={() => (window.location.href = "/login")}
                >
                  Zum Login
                </Button>
              </div>
            </div>
          ) : done ? (
            <div className="text-sm text-emerald-700 text-center">
              Passwort wurde gesetzt. Du wirst weitergeleitet...
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
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
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Passwort bestätigen</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Passwort speichern"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
