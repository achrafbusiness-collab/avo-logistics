import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
const STORAGE_KEY = "avo:email-import-config";

export default function EmailAIImport() {
  const navigate = useNavigate();
  const [step, setStep] = useState("list");
  const [hasStoredConfig, setHasStoredConfig] = useState(false);
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
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoConnect, setAutoConnect] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const previewTextareaRef = useRef(null);
  const appSettingsRef = useRef(null);

  const { data: appSettings = [] } = useQuery({
    queryKey: ["appSettings"],
    queryFn: () => appClient.entities.AppSettings.list("-created_date", 1),
  });

  const isAllSelected = useMemo(() => {
    if (!messages.length) return false;
    return messages.every((msg) => selectedUids.includes(msg.uid));
  }, [messages, selectedUids]);

  const detectProviderFromHost = (host) => {
    const lower = String(host || "").toLowerCase();
    if (lower.includes("gmail")) return "gmail";
    if (lower.includes("office365") || lower.includes("outlook")) return "outlook";
    if (lower.includes("icloud") || lower.includes("me.com")) return "icloud";
    if (lower.includes("yahoo")) return "yahoo";
    return "other";
  };

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

  const persistImapSettings = async (imapPayload) => {
    if (!imapPayload?.host || !imapPayload?.user || !imapPayload?.pass) return;
    const payload = {
      imap_host: imapPayload.host,
      imap_port: imapPayload.port ? Number(imapPayload.port) : null,
      imap_user: imapPayload.user,
      imap_pass: imapPayload.pass,
      imap_secure: Boolean(imapPayload.secure),
    };
    if (appSettings.length > 0) {
      await appClient.entities.AppSettings.update(appSettings[0].id, payload);
    } else {
      await appClient.entities.AppSettings.create(payload);
    }
  };

  const loadMessages = async (queryOverride) => {
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
      const effectiveSearch = String(queryOverride ?? searchTerm).trim();
      const response = await fetch("/api/admin/email-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "list",
          limit: 50,
          search: effectiveSearch,
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
      setPreview(null);
      setSelectionText("");
      setStep("list");
      try {
        await persistImapSettings({
          host: imap.host.trim(),
          port: imap.port,
          secure: Boolean(imap.secure),
          user: imap.user.trim(),
          pass: imap.pass,
        });
      } catch (persistError) {
        console.warn("IMAP Einstellungen konnten nicht gespeichert werden", persistError);
      }
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          provider,
          search: effectiveSearch,
          imap: {
            host: imap.host.trim(),
            port: imap.port,
            secure: Boolean(imap.secure),
            user: imap.user.trim(),
            pass: imap.pass,
            mailbox: imap.mailbox || "INBOX",
          },
        })
      );
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

  const loadPreview = async (uid) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
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
          action: "preview",
          uid,
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
        throw new Error(payload?.error || "E-Mail konnte nicht geladen werden.");
      }
      setPreview(payload?.data || null);
      setSelectionText("");
    } catch (err) {
      setError(err?.message || "E-Mail konnte nicht geladen werden.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleEmailLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([]);
    setSelectedUids([]);
    setPreview(null);
    setSelectionText("");
    setSearchTerm("");
    setHasStoredConfig(false);
    setStep("connect");
    setInfo("");
    setError("");
    navigate(createPageUrl("Orders"));
  };

  const handleImportText = (text) => {
    if (!text?.trim()) {
      setError("Kein Text ausgewählt.");
      return;
    }
    sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ text: text.trim(), autoAnalyze: true })
    );
    navigate(createPageUrl("AIImport"));
  };

  const updateSelection = () => {
    const el = previewTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    if (end > start) {
      setSelectionText(el.value.slice(start, end));
    } else {
      setSelectionText("");
    }
  };

  useEffect(() => {
    if (appSettingsRef.current === "done") return;
    const fromSettings = appSettings[0];
    if (fromSettings?.imap_user && fromSettings?.imap_pass && fromSettings?.imap_host) {
      const providerValue = detectProviderFromHost(fromSettings.imap_host);
      setProvider(providerValue);
      setImap((prev) => ({
        ...prev,
        host: fromSettings.imap_host || prev.host,
        port: fromSettings.imap_port ? String(fromSettings.imap_port) : prev.port,
        secure: fromSettings.imap_secure ?? prev.secure,
        user: fromSettings.imap_user || prev.user,
        pass: fromSettings.imap_pass || prev.pass,
      }));
      if (fromSettings?.imap_mailbox) {
        setImap((prev) => ({ ...prev, mailbox: fromSettings.imap_mailbox }));
      }
      setHasStoredConfig(true);
      setAutoConnect(true);
      appSettingsRef.current = "done";
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setHasStoredConfig(false);
      setStep("connect");
      appSettingsRef.current = "done";
      return;
    }
    try {
      const payload = JSON.parse(stored);
      if (payload?.imap?.user && payload?.imap?.pass && payload?.imap?.host) {
        setProvider(payload?.provider || "other");
        setImap((prev) => ({
          ...prev,
          ...payload.imap,
        }));
        if (payload?.search) {
          setSearchTerm(payload.search);
        }
        setHasStoredConfig(true);
        setAutoConnect(true);
      } else {
        setHasStoredConfig(false);
        setStep("connect");
      }
    } catch {
      setHasStoredConfig(false);
      setStep("connect");
    }
    appSettingsRef.current = "done";
  }, [appSettings]);

  useEffect(() => {
    if (!autoConnect) return;
    setAutoConnect(false);
    loadMessages();
  }, [autoConnect]);

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
        {step === "list" && (
          <Button variant="outline" size="sm" onClick={handleEmailLogout}>
            E-Mail abmelden
          </Button>
        )}
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
              <Button variant="outline" onClick={() => loadMessages()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Aktualisieren
              </Button>
              <Button onClick={handleImport} disabled={importing || !selectedUids.length}>
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Importieren
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex-1">
                <Label>Suche</Label>
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Betreff, Absender oder Text..."
                />
              </div>
              <div className="pt-1 md:pt-6">
                <Button onClick={() => loadMessages(searchTerm)} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Suchen
                </Button>
              </div>
            </div>

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
                  <div
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
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => loadPreview(msg.uid)}
                      disabled={previewLoading}
                    >
                      {previewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Öffnen
                    </Button>
                  </div>
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

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) {
            setPreview(null);
            setSelectionText("");
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden p-0 bg-white text-slate-900">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-[#1e3a5f] via-[#1f476f] to-[#2d5a8a] px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <DialogTitle className="text-lg text-white">
                    {preview?.subject || "E-Mail Vorschau"}
                  </DialogTitle>
                  <p className="text-xs text-blue-100">{preview?.from || ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-[#1e3a5f] text-white hover:bg-[#2d5a8a]"
                    onClick={() => handleImportText(preview?.body || "")}
                    disabled={previewLoading || !preview?.body}
                  >
                    Ganzes E-Mail importieren
                  </Button>
                  <Button
                    className="bg-white text-[#1e3a5f] hover:bg-blue-50"
                    onClick={() => handleImportText(selectionText)}
                    disabled={previewLoading || !selectionText.trim()}
                  >
                    Nur Auswahl importieren
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {preview?.date && (
                <p className="text-xs text-slate-400">
                  {new Date(preview.date).toLocaleString("de-DE")}
                </p>
              )}
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vorschau wird geladen...
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>E-Mail Text (markiere einen Abschnitt für Import)</Label>
                  <Input type="hidden" value={selectionText} readOnly />
                  <textarea
                    ref={previewTextareaRef}
                    value={preview?.body || ""}
                    readOnly
                    onSelect={updateSelection}
                    onMouseUp={updateSelection}
                    onKeyUp={updateSelection}
                    className="min-h-[360px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none"
                  />
                  {selectionText && (
                    <p className="text-xs text-slate-500">
                      Auswahl: {selectionText.length} Zeichen
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
