import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Inbox, Loader2, Mail, RefreshCcw } from "lucide-react";

const PROVIDER_PRESETS = {
  gmail: { host: "imap.gmail.com", port: "993", secure: true },
  outlook: { host: "outlook.office365.com", port: "993", secure: true },
  icloud: { host: "imap.mail.me.com", port: "993", secure: true },
  yahoo: { host: "imap.mail.yahoo.com", port: "993", secure: true },
  other: { host: "", port: "993", secure: true },
};

const PREFILL_KEY = "avo:ai-import-prefill";

export default function EmailAIImport() {
  const navigate = useNavigate();
  const [step, setStep] = useState("connect");
  const [provider, setProvider] = useState("gmail");
  const [imap, setImap] = useState({
    host: PROVIDER_PRESETS.gmail.host,
    port: PROVIDER_PRESETS.gmail.port,
    secure: PROVIDER_PRESETS.gmail.secure,
    user: "",
    pass: "",
    mailbox: "INBOX",
  });
  const [messages, setMessages] = useState([]);
  const [selectedUids, setSelectedUids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const isAllSelected = useMemo(() => {
    if (!messages.length) return false;
    return messages.every((msg) => selectedUids.includes(msg.uid));
  }, [messages, selectedUids]);

  const applyPreset = (value) => {
    const preset = PROVIDER_PRESETS[value] || PROVIDER_PRESETS.other;
    setProvider(value);
    setImap((prev) => ({
      ...prev,
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
    }));
  };

  const updateImap = (field, value) => {
    setImap((prev) => ({ ...prev, [field]: value }));
  };

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const loadMessages = async () => {
    setError("");
    setInfo("");
    if (!imap.user.trim() || !imap.pass.trim() || !imap.host.trim()) {
      setError("Bitte E-Mail, Passwort und IMAP Host angeben.");
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
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
          limit: 50,
          imap: {
            host: imap.host.trim(),
            port: imap.port,
            secure: Boolean(imap.secure),
            user: imap.user.trim(),
            pass: imap.pass,
            mailbox: imap.mailbox || "INBOX",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "IMAP Abruf fehlgeschlagen.");
      }
      setMessages(payload?.data?.messages || []);
      setSelectedUids([]);
      setStep("list");
      setInfo("IMAP verbunden. E-Mails wurden geladen.");
    } catch (err) {
      setError(err?.message || "IMAP Abruf fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedUids([]);
    } else {
      setSelectedUids(messages.map((msg) => msg.uid));
    }
  };

  const handleToggleOne = (uid) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((item) => item !== uid) : [...prev, uid]
    );
  };

  const handleImport = async () => {
    if (!selectedUids.length) {
      setError("Bitte mindestens eine E-Mail auswählen.");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const token = await getToken();
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
          action: "fetch",
          uids: selectedUids,
          imap: {
            host: imap.host.trim(),
            port: imap.port,
            secure: Boolean(imap.secure),
            user: imap.user.trim(),
            pass: imap.pass,
            mailbox: imap.mailbox || "INBOX",
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "E-Mails konnten nicht geladen werden.");
      }
      const combinedText = payload?.data?.combinedText || "";
      if (!combinedText.trim()) {
        throw new Error("Kein E-Mail-Text gefunden.");
      }
      sessionStorage.setItem(
        PREFILL_KEY,
        JSON.stringify({ text: combinedText, autoAnalyze: true })
      );
      navigate(createPageUrl("AIImport"));
    } catch (err) {
      setError(err?.message || "Import fehlgeschlagen.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl("Orders"))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zu Aufträgen
        </Button>
        <div className="flex items-center gap-2 text-slate-700">
          <Mail className="h-5 w-5 text-[#1e3a5f]" />
          <h1 className="text-2xl font-bold text-slate-900">Email AI Import</h1>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {info}
        </div>
      )}

      {step === "connect" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-[#1e3a5f]" />
              E-Mail Konto verbinden
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={applyPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">Google (Gmail)</SelectItem>
                  <SelectItem value="outlook">Outlook / Office 365</SelectItem>
                  <SelectItem value="icloud">Apple iCloud</SelectItem>
                  <SelectItem value="yahoo">Yahoo</SelectItem>
                  <SelectItem value="other">Andere</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>IMAP Host</Label>
              <Input value={imap.host} onChange={(e) => updateImap("host", e.target.value)} />
            </div>
            <div>
              <Label>IMAP Port</Label>
              <Input value={imap.port} onChange={(e) => updateImap("port", e.target.value)} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={Boolean(imap.secure)}
                onCheckedChange={(value) => updateImap("secure", value)}
              />
              <span className="text-sm text-slate-600">SSL/TLS verwenden</span>
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={imap.user}
                onChange={(e) => updateImap("user", e.target.value)}
                placeholder="name@firma.de"
              />
            </div>
            <div>
              <Label>Passwort / App-Passwort</Label>
              <Input
                type="password"
                value={imap.pass}
                onChange={(e) => updateImap("pass", e.target.value)}
                placeholder="App-Passwort"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Postfach (optional)</Label>
              <Input
                value={imap.mailbox}
                onChange={(e) => updateImap("mailbox", e.target.value)}
                placeholder="INBOX"
              />
            </div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Hinweis: Bei Gmail/Outlook/iCloud ist oft ein App-Passwort notwendig und IMAP muss aktiviert sein.
              </p>
              <Button onClick={loadMessages} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verbinden & E-Mails laden
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "list" && (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Gefundene E-Mails</CardTitle>
              <p className="text-sm text-slate-500">
                Wähle eine oder mehrere E-Mails für den Import.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep("connect")}>
                Konto ändern
              </Button>
              <Button variant="outline" onClick={loadMessages} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Aktualisieren
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox checked={isAllSelected} onCheckedChange={handleToggleAll} />
                Alle auswählen
              </label>
              <span className="text-xs text-slate-500">{messages.length} E-Mails</span>
            </div>

            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Keine E-Mails gefunden.
                </div>
              ) : (
                messages.map((msg) => (
                  <label
                    key={msg.uid}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
                  >
                    <Checkbox
                      checked={selectedUids.includes(msg.uid)}
                      onCheckedChange={() => handleToggleOne(msg.uid)}
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {msg.subject || "(Ohne Betreff)"}
                        </span>
                        {!msg.seen && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Neu
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{msg.from || "Unbekannt"}</p>
                      {msg.date && (
                        <p className="text-xs text-slate-400">
                          {new Date(msg.date).toLocaleString("de-DE")}
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => navigate(createPageUrl("Orders"))}>
                Abbrechen
              </Button>
              <Button onClick={handleImport} disabled={importing || !selectedUids.length}>
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ausgewählte importieren
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
