import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { 
  Smartphone, 
  Info, 
  Phone, 
  FileText,
  Save,
  Settings,
  Link as LinkIcon,
  Loader2,
  CheckCircle2
} from 'lucide-react';

export default function AppConnection() {
  const queryClient = useQueryClient();
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const driverUrl = baseUrl ? `${baseUrl}/DriverOrders` : '';
  const driverLoginUrl = baseUrl ? `${baseUrl}/driver` : '';
  const defaultSettings = {
    company_name: 'AVO Logistics',
    support_phone: '',
    support_email: '',
    emergency_phone: '',
    office_address: '',
    office_hours: 'Mo-Fr: 08:00 - 18:00 Uhr',
    app_version: '1.0.0',
    instructions: 'Bitte bei Fragen die Support-Hotline kontaktieren.',
    legal_text: 'Der Kunde und der Fahrer bestätigen, dass das Fahrzeug in dem oben dokumentierten Zustand übernommen wurde und der Fahrer berechtigt ist, das Fahrzeug zu überführen.',
    delivery_legal_text: 'Das Fahrzeug wurde in diesem Zustand ordnungsgemäß übergeben und entgegengenommen.',
    imap_host: '',
    imap_port: '',
    imap_user: '',
    imap_pass: '',
    imap_secure: true,
  };
  const [settings, setSettings] = useState(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imapTesting, setImapTesting] = useState(false);
  const [imapMessage, setImapMessage] = useState('');
  const [imapError, setImapError] = useState('');

  const { data: appSettings = [], isLoading } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => appClient.entities.AppSettings.list('-created_date', 1),
  });

  useEffect(() => {
    if (appSettings.length > 0) {
      setSettings({ ...defaultSettings, ...appSettings[0] });
    }
  }, [appSettings]);

  useEffect(() => {
    if (!settings.imap_host || settings.imap_port) return;
    setSettings((prev) => ({
      ...prev,
      imap_port: prev.imap_secure ? '993' : '143',
    }));
  }, [settings.imap_host, settings.imap_port, settings.imap_secure]);

  const toIntOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.AppSettings.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.AppSettings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...settings,
      imap_port: toIntOrNull(settings.imap_port),
      imap_secure: Boolean(settings.imap_secure),
    };
    if (appSettings.length > 0) {
      await updateMutation.mutateAsync({ id: appSettings[0].id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleImapTest = async () => {
    setImapMessage('');
    setImapError('');
    if (!settings.imap_host.trim() || !settings.imap_user.trim() || !settings.imap_pass.trim()) {
      setImapError('Bitte IMAP Host, Benutzer und Passwort eintragen.');
      return;
    }
    setImapTesting(true);
    try {
      await handleSave();
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error('Nicht angemeldet.');
      }
      const response = await fetch('/api/admin/email-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'list',
          limit: 1,
          imap: {
            host: settings.imap_host.trim(),
            port: toIntOrNull(settings.imap_port),
            secure: Boolean(settings.imap_secure),
            user: settings.imap_user.trim(),
            pass: settings.imap_pass,
            mailbox: 'INBOX',
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'IMAP Test fehlgeschlagen.');
      }
      setImapMessage('IMAP Verbindung erfolgreich. Einstellungen sind gespeichert.');
    } catch (err) {
      setImapError(err?.message || 'IMAP Test fehlgeschlagen.');
    } finally {
      setImapTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">App & Einstellungen</h1>
        <p className="text-gray-500">Konfiguriere die Fahrer-App und verwalte Informationen</p>
      </div>

      {/* App Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            App-Informationen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>App Version</Label>
              <Input 
                value={settings.app_version}
                onChange={(e) => setSettings({...settings, app_version: e.target.value})}
              />
            </div>
            <div>
              <Label>Firmenname</Label>
              <Input 
                value={settings.company_name}
                onChange={(e) => setSettings({...settings, company_name: e.target.value})}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Support Kontakt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Support & Notfallkontakte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Support Telefon</Label>
              <Input 
                value={settings.support_phone}
                onChange={(e) => setSettings({...settings, support_phone: e.target.value})}
                placeholder="+49 ..."
              />
            </div>
            <div>
              <Label>Support E-Mail</Label>
              <Input 
                type="email"
                value={settings.support_email}
                onChange={(e) => setSettings({...settings, support_email: e.target.value})}
              />
            </div>
            <div>
              <Label>Notfall-Hotline</Label>
              <Input 
                value={settings.emergency_phone}
                onChange={(e) => setSettings({...settings, emergency_phone: e.target.value})}
                placeholder="+49 ..."
              />
            </div>
            <div>
              <Label>Büro-Zeiten</Label>
              <Input 
                value={settings.office_hours}
                onChange={(e) => setSettings({...settings, office_hours: e.target.value})}
              />
            </div>
          </div>
          <div>
            <Label>Büro-Adresse</Label>
            <Input 
              value={settings.office_address}
              onChange={(e) => setSettings({...settings, office_address: e.target.value})}
            />
          </div>
        </CardContent>
      </Card>

      {/* E-Mail Postfach (IMAP) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            E-Mail Postfach (AI Import)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Hinterlege hier dein IMAP Postfach. Die Einstellungen werden systemweit gespeichert
            und sind auf allen Geräten verfügbar.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                onCheckedChange={(checked) => {
                  const secure = Boolean(checked);
                  setSettings((prev) => {
                    const next = { ...prev, imap_secure: secure };
                    if (!prev.imap_port || prev.imap_port === '993' || prev.imap_port === '143') {
                      next.imap_port = secure ? '993' : '143';
                    }
                    return next;
                  });
                }}
              />
              <span className="text-sm text-gray-600">TLS/SSL aktiv</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleImapTest}
              disabled={imapTesting}
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            >
              {imapTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Test läuft...
                </>
              ) : (
                'IMAP Test & speichern'
              )}
            </Button>
            {imapMessage && <span className="text-sm text-emerald-600">{imapMessage}</span>}
            {imapError && <span className="text-sm text-red-600">{imapError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Rechtstexte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Rechtstexte & Bestätigungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Bestätigungstext Abholung</Label>
            <Textarea 
              value={settings.legal_text}
              onChange={(e) => setSettings({...settings, legal_text: e.target.value})}
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              Dieser Text wird bei der Unterschrift der Abholung angezeigt
            </p>
          </div>
          <div>
            <Label>Bestätigungstext Abgabe</Label>
            <Textarea 
              value={settings.delivery_legal_text}
              onChange={(e) => setSettings({...settings, delivery_legal_text: e.target.value})}
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              Dieser Text wird bei der Unterschrift der Abgabe angezeigt
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Anweisungen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Allgemeine Anweisungen für Fahrer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea 
            value={settings.instructions}
            onChange={(e) => setSettings({...settings, instructions: e.target.value})}
            rows={5}
            placeholder="Wichtige Hinweise und Anweisungen für Fahrer..."
          />
        </CardContent>
      </Card>

      {/* Protokoll-Einstellungen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Protokoll-Einstellungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2">Pflicht-Fotos</h4>
            <p className="text-sm text-blue-800">
              Die App fordert 19 Pflicht-Fotos in fester Reihenfolge:
            </p>
            <ol className="text-sm text-blue-800 mt-2 ml-4 list-decimal space-y-1">
              <li>Kilometerstand</li>
              <li>Fahrertür</li>
              <li>Felge vorne links</li>
              <li>Front rechts</li>
              <li>Fahrzeug Front</li>
              <li>Front links</li>
              <li>Felge vorne rechts</li>
              <li>Beifahrertür</li>
              <li>Hintere Tür rechts</li>
              <li>Felge hinten rechts</li>
              <li>Heck rechts</li>
              <li>Fahrzeug hinten</li>
              <li>Kofferraum</li>
              <li>Heck links</li>
              <li>Felge hinten links</li>
              <li>Hintere Tür links</li>
              <li>Windschutzscheibe</li>
              <li>Innenraum vorne</li>
              <li>Innenraum hinten</li>
            </ol>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-900 mb-2">Pflicht-Prüfungen</h4>
            <p className="text-sm text-green-800">
              Alle Prüfpunkte müssen mit JA/NEIN beantwortet werden:
            </p>
            <ul className="text-sm text-green-800 mt-2 ml-4 list-disc space-y-1">
              <li>Fahrgestellnummer (FIN) geprüft</li>
              <li>Kilometerstand korrekt erfasst</li>
              <li>Tankinhalt korrekt angegeben</li>
              <li>Außenbereich des Fahrzeugs geprüft</li>
              <li>Innenraum geprüft</li>
              <li>Alle Fotos vollständig</li>
              <li>Fahrzeug auf Schäden kontrolliert</li>
              <li>Schäden dokumentiert</li>
              <li>Zubehör geprüft</li>
              <li>Kontaktdaten korrekt</li>
              <li>Kunde informiert</li>
              <li>Unterschriften eingeholt</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* App-Zugriff für Fahrer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Fahrer-App Zugriff
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2">📱 App-Link für Fahrer</h4>
            <p className="text-sm text-blue-800 mb-3">
              Verwenden Sie die URL Ihrer eigenen Installation. Für eine eigene Domain wie
              "app.avo-logistics.app" registrieren Sie die Domain und verknuepfen Sie diese
              mit Ihrem Hosting-Anbieter.
            </p>
            {driverUrl && (
              <div className="flex flex-col gap-2">
                <Input value={driverUrl} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(driverUrl)}
                >
                  Link kopieren
                </Button>
              </div>
            )}
          </div>

          <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
            <h4 className="font-semibold text-indigo-900 mb-2">🔐 Fahrer-Login Seite</h4>
            <p className="text-sm text-indigo-800 mb-3">
              Fahrer melden sich hier an und gelangen direkt zur Fahrer-App.
            </p>
            {driverLoginUrl && (
              <div className="flex flex-col gap-2">
                <Input value={driverLoginUrl} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(driverLoginUrl)}
                >
                  Login-Link kopieren
                </Button>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave}
          disabled={saving || isLoading}
          className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Speichern...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Gespeichert!
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Einstellungen speichern
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
