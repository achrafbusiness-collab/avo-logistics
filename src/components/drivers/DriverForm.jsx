import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AddressAutocomplete from "@/components/ui/address-autocomplete";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Save,
  X,
  Loader2,
  Upload,
  FileText,
  CreditCard,
  CheckCircle2,
  Copy,
  Mail,
  Phone,
  Key,
  Link2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';

const driverSchema = z.object({
  first_name: z.string().min(1, 'Vorname ist erforderlich'),
  last_name: z.string().min(1, 'Nachname ist erforderlich'),
  email: z.string().min(1, 'E-Mail ist erforderlich').email('Ungültige E-Mail-Adresse'),
  phone: z.string().optional().default(''),
  address: z.string().min(1, 'Straße und Hausnummer ist erforderlich'),
  city: z.string().optional().default(''),
  postal_code: z.string().optional().default(''),
  country: z.string().optional().default('Deutschland'),
  nationality: z.string().optional().default(''),
  birth_date: z.string().optional().default(''),
  status: z.string().default('active'),
  license_front: z.string().optional().default(''),
  license_back: z.string().optional().default(''),
  license_number: z.string().optional().default(''),
  id_card_front: z.string().optional().default(''),
  id_card_back: z.string().optional().default(''),
  license_expiry: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

const defaultValues = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  postal_code: '',
  country: 'Deutschland',
  nationality: '',
  birth_date: '',
  status: 'active',
  license_front: '',
  license_back: '',
  license_number: '',
  id_card_front: '',
  id_card_back: '',
  license_expiry: '',
  notes: '',
};

const buildFormValues = (driverData) => {
  if (!driverData || typeof driverData !== 'object') {
    return { ...defaultValues };
  }
  const normalized = {};
  Object.entries(defaultValues).forEach(([key, defaultValue]) => {
    normalized[key] = driverData[key] ?? defaultValue;
  });
  return normalized;
};

export default function DriverForm({ driver, onSave, onCancel }) {
  const form = useForm({
    resolver: zodResolver(driverSchema),
    defaultValues: buildFormValues(driver),
  });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({});
  const [loginResult, setLoginResult] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [loginCreating, setLoginCreating] = useState(false);
  const [createdDriverId, setCreatedDriverId] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [formError, setFormError] = useState('');
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const baseInviteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim() || window.location.origin;

  const copyToClipboard = (text, field) => {
    navigator.clipboard?.writeText(text || '');
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  useEffect(() => {
    form.reset(buildFormValues(driver));
    setLoginResult(null);
    setLoginError('');
    setCreatedDriverId('');
    setResetMessage('');
    setResetError('');
    setFormError('');
  }, [driver, form]);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const handleDriverReset = async () => {
    const email = form.getValues('email');
    if (!email) {
      setResetError('E-Mail-Adresse fehlt.');
      return;
    }
    setResetSending(true);
    setResetMessage('');
    setResetError('');
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('Nicht angemeldet.');
      }
      const response = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          purpose: 'recovery',
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Reset-Link konnte nicht gesendet werden.');
      }
      setResetMessage('Passwort-Reset freigegeben. Link wurde per E-Mail gesendet.');
    } catch (err) {
      setResetError(err?.message || 'Reset-Link konnte nicht gesendet werden.');
    } finally {
      setResetSending(false);
    }
  };

  const handleFileUpload = async (field, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      window.alert(`Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximal 10 MB erlaubt.`);
      return;
    }
    setUploading(prev => ({ ...prev, [field]: true }));
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      form.setValue(field, file_url, { shouldValidate: true });
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(prev => ({ ...prev, [field]: false }));
    }
  };

  const onSubmit = async (formData) => {
    setFormError('');
    setLoginError('');
    setSaving(true);
    setLoginResult(null);
    try {
      const payload = {
        ...formData,
        birth_date: formData.birth_date || null,
        license_expiry: formData.license_expiry || null,
        license_number: formData.license_number || null,
        status: !driver ? 'pending' : formData.status,
      };
      const created = await onSave(payload);
      if (!driver && created?.id) {
        setCreatedDriverId(created.id);
      }
      if (!driver) {
        setLoginCreating(true);
        const token = await getAuthToken();
        if (!token) {
          setLoginError('Nicht angemeldet.');
          return;
        }
        const fullName = `${formData.first_name || ''} ${formData.last_name || ''}`.trim();
        const response = await fetch('/api/admin/create-driver-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: formData.email,
            login_url: `${baseInviteUrl.replace(/\/$/, '')}/login/driver`,
            profile: {
              full_name: fullName,
              phone: formData.phone,
              permissions: {},
            },
          }),
        });
        const result = await response.json();
        if (!response.ok || !result?.ok) {
          setLoginError(result?.error || 'Login konnte nicht erstellt werden.');
          return;
        }
        setLoginResult(result.data || null);
        setShowResultDialog(true);
      }
    } catch (error) {
      setLoginError(error?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
      setLoginCreating(false);
    }
  };

  const onInvalid = () => {
    setFormError('Bitte alle Pflichtfelder ausfüllen.');
  };

  const FileUploadField = ({ label, field, icon: Icon }) => {
    const value = form.watch(field);
    return (
      <div className="space-y-2">
        <FormLabel>{label}</FormLabel>
        <div className="flex items-center gap-3">
          {value ? (
            <div className="flex items-center gap-2 flex-1 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Icon className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-800 truncate flex-1">Dokument hochgeladen</span>
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                Anzeigen
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => form.setValue(field, '', { shouldValidate: true })}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <label className="flex items-center gap-2 flex-1 p-3 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-[#1e3a5f] hover:bg-gray-50 transition-all">
              {uploading[field] ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <Upload className="w-5 h-5 text-gray-400" />
              )}
              <span className="text-sm text-gray-500">
                {uploading[field] ? 'Hochladen...' : 'Klicken zum Hochladen (max. 10 MB)'}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => handleFileUpload(field, e.target.files[0])}
                disabled={uploading[field]}
              />
            </label>
          )}
        </div>
      </div>
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="flex flex-col gap-4 border-b bg-gradient-to-r from-slate-50 to-white md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-xl text-slate-900">
                {driver ? 'Fahrer bearbeiten' : 'Neuer Fahrer'}
              </CardTitle>
              <p className="text-sm text-slate-500">
                Pflichtfelder: Vorname, Nachname, Straße &amp; E-Mail.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>
                <X className="w-4 h-4 mr-2" />
                Abbrechen
              </Button>
              <Button type="submit" disabled={saving} className="bg-[#1e3a5f] hover:bg-[#2d5a8a]">
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Speichern
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-8">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            {/* Personal Info */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[#1e3a5f]">
                <User className="w-5 h-5" />
                <h3 className="font-semibold">Persönliche Daten</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Vorname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nachname" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Mail *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="fahrer@email.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="+49 ..." />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Straße &amp; Hausnummer *</FormLabel>
                        <FormControl>
                          <AddressAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            onSelect={({ address, city, postalCode }) => {
                              form.setValue('address', address, { shouldValidate: true });
                              if (city) form.setValue('city', city);
                              if (postalCode) form.setValue('postal_code', postalCode);
                            }}
                            placeholder="Straße und Hausnummer"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="postal_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postleitzahl (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="PLZ" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stadt (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Stadt" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Land (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Deutschland" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staatsangehörigkeit (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="z.B. Deutsch" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birth_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geburtsdatum (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Ready</SelectItem>
                          <SelectItem value="pending">Bearbeitung</SelectItem>
                          <SelectItem value="inactive">Inaktiv</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {driver && form.watch('email') && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Passwort-Reset</p>
                    <p className="text-xs text-slate-500">
                      Sendet dem Fahrer einen Link zur Passwort-Einrichtung.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDriverReset}
                    disabled={resetSending}
                  >
                    {resetSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Reset-Link senden
                  </Button>
                </div>
                {resetMessage && (
                  <div className="mt-2 text-xs text-emerald-700">{resetMessage}</div>
                )}
                {resetError && (
                  <div className="mt-2 text-xs text-red-600">{resetError}</div>
                )}
              </div>
            )}

            {!driver && loginError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {loginError}
              </div>
            )}

            {/* Success Dialog after creating a new driver */}
            <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <DialogTitle className="text-center text-lg">
                    Fahrer erfolgreich angelegt!
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 mt-1">
                  {/* Driver Info */}
                  <div className="flex items-center gap-3 px-1">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium">
                      {form.getValues('first_name')} {form.getValues('last_name')}
                    </span>
                    <span className="text-xs text-slate-400 truncate ml-auto">{form.getValues('email')}</span>
                  </div>

                  {/* Login Credentials */}
                  {loginResult && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Zugangsdaten</p>

                      {loginResult.tempPassword && (
                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">Temporäres Passwort</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm font-bold text-[#1e3a5f] tracking-wide truncate">
                              {loginResult.tempPassword}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="shrink-0 h-8 w-8"
                              onClick={() => copyToClipboard(loginResult.tempPassword, 'password')}
                            >
                              {copiedField === 'password' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>
                      )}

                      {loginResult.loginUrl && (
                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">Login-URL</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 truncate">
                              {loginResult.loginUrl}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="shrink-0 h-8 w-8"
                              onClick={() => copyToClipboard(loginResult.loginUrl, 'loginUrl')}
                            >
                              {copiedField === 'loginUrl' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>
                      )}

                      {!loginResult.emailSent && loginResult.resetLink && (
                        <div>
                          <p className="text-[11px] text-slate-400 mb-1">Reset-Link</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 truncate">
                              {loginResult.resetLink}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="shrink-0 h-8 w-8"
                              onClick={() => copyToClipboard(loginResult.resetLink, 'resetLink')}
                            >
                              {copiedField === 'resetLink' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Email Status */}
                  {loginResult?.emailSent ? (
                    <p className="text-xs text-emerald-600 text-center">
                      Einladungs-E-Mail an {form.getValues('email')} gesendet.
                    </p>
                  ) : loginResult?.emailError ? (
                    <p className="text-xs text-amber-600 text-center">
                      E-Mail-Versand fehlgeschlagen — bitte Zugangsdaten manuell weitergeben.
                    </p>
                  ) : null}

                  <p className="text-[11px] text-center text-slate-400">
                    Status bleibt auf „Bearbeitung" bis der Fahrer sein Passwort gesetzt hat.
                  </p>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowResultDialog(false);
                        onCancel();
                      }}
                    >
                      Zur Liste
                    </Button>
                    {createdDriverId && (
                      <Button
                        type="button"
                        className="flex-1 bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                        onClick={() => {
                          setShowResultDialog(false);
                          window.location.href = `/drivers?id=${createdDriverId}`;
                        }}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Profil öffnen
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Separator />

            {/* License Documents */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[#1e3a5f]">
                <FileText className="w-5 h-5" />
                <h3 className="font-semibold">Führerschein</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="license_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Führerscheinnummer (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="z.B. DE1234567" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FileUploadField
                  label="Führerschein Vorderseite"
                  field="license_front"
                  icon={CreditCard}
                />
                <FileUploadField
                  label="Führerschein Rückseite"
                  field="license_back"
                  icon={CreditCard}
                />
              </div>
              <div className="md:w-1/2">
                <FormField
                  control={form.control}
                  name="license_expiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Führerschein gültig bis (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* ID Documents */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[#1e3a5f]">
                <CreditCard className="w-5 h-5" />
                <h3 className="font-semibold">Personalausweis</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FileUploadField
                  label="Ausweis Vorderseite"
                  field="id_card_front"
                  icon={CreditCard}
                />
                <FileUploadField
                  label="Ausweis Rückseite"
                  field="id_card_back"
                  icon={CreditCard}
                />
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Interne Notizen zum Fahrer..." rows={3} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
