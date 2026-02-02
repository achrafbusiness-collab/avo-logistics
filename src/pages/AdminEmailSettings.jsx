import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appClient } from "@/api/appClient";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Mail, Save, Server, Loader2, Send } from "lucide-react";

const defaultSettings = {
  email_sender_name: "",
  email_sender_address: "",
  smtp_host: "",
  smtp_port: "",
  smtp_user: "",
  smtp_pass: "",
  smtp_secure: true,
  imap_host: "",
  imap_port: "",
  imap_user: "",
  imap_pass: "",
  imap_secure: true,
};

export default function AdminEmailSettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testError, setTestError] = useState("");
  const [imapTesting, setImapTesting] = useState(false);
  const [imapMessage, setImapMessage] = useState("");
  const [imapError, setImapError] = useState("");

  const toIntOrNull = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSmtpPortChange = (value) => {
    setSettings((prev) => {
      const parsed = Number(value);
      const next = { ...prev, smtp_port: value };
      if (Number.isFinite(parsed)) {
        if (parsed === 465) next.smtp_secure = true;
        if (parsed === 587) next.smtp_secure = false;
      }
      return next;
    });
  };

  const handleImapPortChange = (value) => {
    setSettings((prev) => {
      const parsed = Number(value);
      const next = { ...prev, imap_port: value };
      if (Number.isFinite(parsed)) {
        if (parsed === 993) next.imap_secure = true;
        if (parsed === 143) next.imap_secure = false;
      }
      return next;
    });
  };

  const { data: appSettings = [] } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => appClient.entities.AppSettings.list("-created_date", 1),
  });

  useEffect(() => {
    if (appSettings.length > 0) {
      const current = appSettings[0];
      setSettings({
        ...defaultSettings,
        ...current,
        smtp_port: current.smtp_port ? String(current.smtp_port) : "",
        imap_port: current.imap_port ? String(current.imap_port) : "",
      });
      setTestEmail((prev) => prev || appSettings[0].smtp_user || "");
    }
  }, [appSettings]);

  useEffect(() => {
    setSettings((prev) => {
      let next = prev;
      let changed = false;
      if (prev.smtp_host && !prev.imap_host) {
        next = { ...next, imap_host: prev.smtp_host };
        changed = true;
      }
      if (prev.smtp_user && !prev.imap_user) {
        next = { ...next, imap_user: prev.smtp_user };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [settings.smtp_host, settings.smtp_user]);

  useEffect(() => {
    if (!settings.smtp_host || settings.smtp_port) return;
    setSettings((prev) => {
      if (!prev.smtp_host || prev.smtp_port) return prev;
      return { ...prev, smtp_port: prev.smtp_secure ? "465" : "587" };
    });
  }, [settings.smtp_host, settings.smtp_port, settings.smtp_secure]);

  useEffect(() => {
    if (!settings.imap_host || settings.imap_port) return;
    setSettings((prev) => {
      if (!prev.imap_host || prev.imap_port) return prev;
      return { ...prev, imap_port: prev.imap_secure ? "993" : "143" };
    });
  }, [settings.imap_host, settings.imap_port, settings.imap_secure]);

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.AppSettings.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appSettings"] });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.AppSettings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appSettings"] });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...settings,
      smtp_port: toIntOrNull(settings.smtp_port),
      imap_port: toIntOrNull(settings.imap_port),
      smtp_secure: Boolean(settings.smtp_secure),
      imap_secure: Boolean(settings.imap_secure),
    };
    try {
      if (appSettings.length > 0) {
        await updateMutation.mutateAsync({ id: appSettings[0].id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch (error) {
      setSaving(false);
      throw error;
    }
  };

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session?.access_token || null;
  };

  const handleImapConnect = async () => {
    setImapMessage("");
    setImapError("");
    if (!settings.imap_host.trim() || !settings.imap_user.trim() || !settings.imap_pass.trim()) {
      setImapError("Bitte IMAP Host, Benutzer und Passwort eingeben.");
      return;
    }
    setImapTesting(true);
    try {
      await handleSave();
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
      const response = await fetch("/api/admin/email-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "list",
          limit: 1,
          imap: {
            host: settings.imap_host.trim(),
            port: toIntOrNull(settings.imap_port),
            secure: Boolean(settings.imap_secure),
            user: settings.imap_user.trim(),
            pass: settings.imap_pass,
            mailbox: "INBOX",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "IMAP Verbindung fehlgeschlagen.");
      }
      setImapMessage("Postfach verbunden. E-Mails werden im Email AI Import angezeigt.");
    } catch (error) {
      setImapError(error?.message || "IMAP Verbindung fehlgeschlagen.");
    } finally {
      setImapTesting(false);
    }
  };

  const handleSendTest = async () => {
    setTestMessage("");
    setTestError("");
    if (!testEmail.trim()) {
      setTestError("Bitte eine Test-E-Mail-Adresse eingeben.");
      return;
    }
    setTestSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
      const response = await fetch("/api/admin/send-driver-assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ testEmail: true, to: testEmail.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Test-E-Mail fehlgeschlagen.");
      }
      setTestMessage("Test-E-Mail wurde versendet.");
    } catch (err) {
      setTestError(err?.message || "Test-E-Mail fehlgeschlagen.");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to={createPageUrl("AdminControlling")}>
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Zurück zu Admin Controlling
          </Button>
        </Link>
        {saved && (
          <span className="text-sm text-emerald-600">Einstellungen gespeichert.</span>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">E-Mail Postfach</h1>
        <p className="text-sm text-slate-500">
          SMTP wird für den Versand der Fahrer-Auftragsbestätigungen genutzt. IMAP ist optional
          (nur falls du das Postfach verbinden möchtest).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Absender
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Absender-Name</Label>
            <Input
              value={settings.email_sender_name}
              onChange={(e) => setSettings({ ...settings, email_sender_name: e.target.value })}
              placeholder="AVO Logistics"
            />
          </div>
          <div>
            <Label>Absender-E-Mail</Label>
            <Input
              type="email"
              value={settings.email_sender_address}
              onChange={(e) =>
                setSettings({ ...settings, email_sender_address: e.target.value })
              }
              placeholder="noreply@deine-domain.de"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Test E-Mail
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <Label>Test-E-Mail an</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="deine@email.de"
            />
          </div>
          <Button onClick={handleSendTest} disabled={testSending}>
            {testSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Test senden
          </Button>
          {testMessage && <span className="text-sm text-emerald-600">{testMessage}</span>}
          {testError && <span className="text-sm text-red-600">{testError}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            SMTP (Versand)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>SMTP Host</Label>
            <Input
              value={settings.smtp_host}
              onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
              placeholder="smtp.deine-domain.de"
            />
          </div>
          <div>
            <Label>SMTP Port</Label>
            <Input
              type="number"
              value={settings.smtp_port}
              onChange={(e) => handleSmtpPortChange(e.target.value)}
              placeholder="465"
            />
          </div>
          <div>
            <Label>SMTP Benutzer</Label>
            <Input
              value={settings.smtp_user}
              onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
              placeholder="noreply@deine-domain.de"
            />
          </div>
          <div>
            <Label>SMTP Passwort</Label>
            <Input
              type="password"
              value={settings.smtp_pass}
              onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={Boolean(settings.smtp_secure)}
              onCheckedChange={(checked) =>
                setSettings((prev) => {
                  const secure = Boolean(checked);
                  const next = { ...prev, smtp_secure: secure };
                  const currentPort = prev.smtp_port;
                  if (!currentPort || currentPort === "587" || currentPort === "465") {
                    const desired = secure ? "465" : "587";
                    if (!currentPort || currentPort === (secure ? "587" : "465")) {
                      next.smtp_port = desired;
                    }
                  }
                  return next;
                })
              }
            />
            <span className="text-sm text-slate-600">TLS/SSL aktiv</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            IMAP (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>IMAP Host</Label>
            <Input
              value={settings.imap_host}
              onChange={(e) => setSettings({ ...settings, imap_host: e.target.value })}
              placeholder="imap.deine-domain.de"
            />
          </div>
          <div>
            <Label>IMAP Port</Label>
            <Input
              type="number"
              value={settings.imap_port}
              onChange={(e) => handleImapPortChange(e.target.value)}
              placeholder="993"
            />
          </div>
          <div>
            <Label>IMAP Benutzer</Label>
            <Input
              value={settings.imap_user}
              onChange={(e) => setSettings({ ...settings, imap_user: e.target.value })}
              placeholder="info@deine-domain.de"
            />
          </div>
          <div>
            <Label>IMAP Passwort</Label>
            <Input
              type="password"
              value={settings.imap_pass}
              onChange={(e) => setSettings({ ...settings, imap_pass: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={Boolean(settings.imap_secure)}
              onCheckedChange={(checked) =>
                setSettings((prev) => {
                  const secure = Boolean(checked);
                  const next = { ...prev, imap_secure: secure };
                  const currentPort = prev.imap_port;
                  if (!currentPort || currentPort === "993" || currentPort === "143") {
                    const desired = secure ? "993" : "143";
                    if (!currentPort || currentPort === (secure ? "143" : "993")) {
                      next.imap_port = desired;
                    }
                  }
                  return next;
                })
              }
            />
            <span className="text-sm text-slate-600">TLS/SSL aktiv</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button
              onClick={handleImapConnect}
              disabled={imapTesting}
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            >
              {imapTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Postfach verbinden
            </Button>
            <Link to={createPageUrl("EmailAIImport")}>
              <Button variant="outline">Email AI Import öffnen</Button>
            </Link>
            {imapMessage && <span className="text-sm text-emerald-600">{imapMessage}</span>}
            {imapError && <span className="text-sm text-red-600">{imapError}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
