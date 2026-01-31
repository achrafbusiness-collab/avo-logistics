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
import { ArrowLeft, Mail, Save, Server, Loader2 } from "lucide-react";

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

  const { data: appSettings = [] } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => appClient.entities.AppSettings.list("-created_date", 1),
  });

  useEffect(() => {
    if (appSettings.length > 0) {
      setSettings({ ...defaultSettings, ...appSettings[0] });
    }
  }, [appSettings]);

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
    if (appSettings.length > 0) {
      await updateMutation.mutateAsync({ id: appSettings[0].id, data: settings });
    } else {
      await createMutation.mutateAsync(settings);
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
              onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
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
                setSettings({ ...settings, smtp_secure: Boolean(checked) })
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
              onChange={(e) => setSettings({ ...settings, imap_port: e.target.value })}
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
                setSettings({ ...settings, imap_secure: Boolean(checked) })
              }
            />
            <span className="text-sm text-slate-600">TLS/SSL aktiv</span>
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
