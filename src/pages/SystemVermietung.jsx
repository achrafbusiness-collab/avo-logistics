import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { appClient } from "@/api/appClient";

export default function SystemVermietung() {
  const [currentUser, setCurrentUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  useEffect(() => {
    const load = async () => {
      const user = await appClient.auth.getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const token = await getAuthToken();
        if (!token) {
          setChecking(false);
          return;
        }
        const response = await fetch("/api/admin/check-owner", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json();
        setIsOwner(Boolean(payload?.isOwner));
      } catch (err) {
        setIsOwner(false);
      } finally {
        setChecking(false);
      }
    };
    load();
  }, []);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setInviteLink("");

    if (!companyName.trim() || !ownerEmail.trim() || !ownerName.trim()) {
      setError("Bitte Firmenname, Geschäftsführer und E-Mail ausfüllen.");
      return;
    }

    setSaving(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
      const response = await fetch("/api/admin/create-company", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          owner_full_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          owner_phone: ownerPhone.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Mandant konnte nicht erstellt werden.");
      }
      setMessage(`Mandant "${payload.data.company_name}" wurde angelegt.`);
      if (payload.data.emailSent === false && payload.data.actionLink) {
        setInviteLink(payload.data.actionLink);
      }
      setCompanyName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPhone("");
    } catch (err) {
      setError(err?.message || "Mandant konnte nicht erstellt werden.");
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Lade Systemverwaltung...
      </div>
    );
  }

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-500">
          <AlertCircle className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <p className="font-semibold">Kein Zugriff</p>
          <p className="text-sm">Diese Seite ist nur für den Systembetreiber verfügbar.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System‑Vermietung</h1>
        <p className="text-sm text-slate-500">
          Lege neue Mandanten an und erstelle den Geschäftsführer‑Zugang.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#1e3a5f]">
            <Building2 className="h-5 w-5" />
            Neuer Mandant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Firmenname *</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <Label>Geschäftsführer *</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
              <div>
                <Label>Geschäftsführer E‑Mail *</Label>
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {message && (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {message}
                </div>
                {inviteLink && (
                  <div className="text-xs text-emerald-700">
                    E‑Mail konnte nicht gesendet werden. Link manuell weitergeben:
                    <div className="mt-1 break-all rounded bg-white/70 p-2">{inviteLink}</div>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mandant anlegen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
