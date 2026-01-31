import React, { useState, useEffect } from 'react';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  User, 
  Save,
  X,
  Loader2,
  Upload,
  FileText,
  CreditCard
} from 'lucide-react';

const defaultFormData = {
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

const buildFormData = (driverData) => {
  if (!driverData || typeof driverData !== 'object') {
    return { ...defaultFormData };
  }

  const normalized = { ...driverData };
  Object.entries(defaultFormData).forEach(([key, defaultValue]) => {
    normalized[key] = driverData[key] ?? defaultValue;
  });

  return normalized;
};

export default function DriverForm({ driver, onSave, onCancel }) {
  const [formData, setFormData] = useState(() => ({ ...defaultFormData }));

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
  const [fieldErrors, setFieldErrors] = useState({});
  const baseInviteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim() || window.location.origin;

  const requiredFields = [
    { key: 'first_name', label: 'Vorname' },
    { key: 'last_name', label: 'Nachname' },
    { key: 'email', label: 'E-Mail' },
    { key: 'address', label: 'Straße und Hausnummer' },
  ];

  useEffect(() => {
    setFormData(buildFormData(driver));
    setLoginResult(null);
    setLoginError('');
    setCreatedDriverId('');
    setResetMessage('');
    setResetError('');
    setFormError('');
    setFieldErrors({});
  }, [driver]);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const handleDriverReset = async () => {
    if (!formData.email) {
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
          email: formData.email,
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

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleFileUpload = async (field, file) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, [field]: true }));
    try {
      const { file_url } = await appClient.integrations.Core.UploadFile({ file });
      handleChange(field, file_url);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoginError('');
    const missing = {};
    requiredFields.forEach(({ key }) => {
      if (!String(formData[key] || '').trim()) {
        missing[key] = true;
      }
    });
    if (Object.keys(missing).length) {
      setFieldErrors(missing);
      setFormError('Bitte alle Pflichtfelder ausfüllen.');
      return;
    }
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
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          setLoginError(payload?.error || 'Login konnte nicht erstellt werden.');
          return;
        }
        setLoginResult(payload.data || null);
      }
    } catch (error) {
      setLoginError(error?.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
      setLoginCreating(false);
    }
  };

  const FileUploadField = ({ label, field, icon: Icon }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {formData[field] ? (
          <div className="flex items-center gap-2 flex-1 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Icon className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-800 truncate flex-1">Dokument hochgeladen</span>
            <a 
              href={formData[field]} 
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
              onClick={() => handleChange(field, '')}
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
              {uploading[field] ? 'Hochladen...' : 'Klicken zum Hochladen'}
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

  return (
    <form onSubmit={handleSubmit}>
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
              <div>
                <Label>Vorname *</Label>
                <Input 
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  placeholder="Vorname"
                  required
                  className={fieldErrors.first_name ? 'border-red-300 focus-visible:ring-red-200' : ''}
                />
              </div>
              <div>
                <Label>Nachname *</Label>
                <Input 
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  placeholder="Nachname"
                  required
                  className={fieldErrors.last_name ? 'border-red-300 focus-visible:ring-red-200' : ''}
                />
              </div>
              <div>
                <Label>E-Mail *</Label>
                <Input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="fahrer@email.com"
                  required
                  className={fieldErrors.email ? 'border-red-300 focus-visible:ring-red-200' : ''}
                />
              </div>
              <div>
                <Label>Telefon (optional)</Label>
                <Input 
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+49 ..."
                />
              </div>
              <div className="md:col-span-2">
                <Label>Straße &amp; Hausnummer *</Label>
                <AddressAutocomplete
                  value={formData.address}
                  onChange={(value) => handleChange('address', value)}
                  onSelect={({ address, city, postalCode }) => {
                    handleChange('address', address);
                    if (city) handleChange('city', city);
                    if (postalCode) handleChange('postal_code', postalCode);
                  }}
                  placeholder="Straße und Hausnummer"
                  required
                  inputClassName={fieldErrors.address ? 'border-red-300 focus-visible:ring-red-200' : ''}
                />
              </div>
              <div>
                <Label>Postleitzahl (optional)</Label>
                <Input 
                  value={formData.postal_code}
                  onChange={(e) => handleChange('postal_code', e.target.value)}
                  placeholder="PLZ"
                />
              </div>
              <div>
                <Label>Stadt (optional)</Label>
                <Input 
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Stadt"
                />
              </div>
              <div>
                <Label>Land (optional)</Label>
                <Input 
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  placeholder="Deutschland"
                />
              </div>
              <div>
                <Label>Staatsangehörigkeit (optional)</Label>
                <Input 
                  value={formData.nationality}
                  onChange={(e) => handleChange('nationality', e.target.value)}
                  placeholder="z.B. Deutsch"
                />
              </div>
              <div>
                <Label>Geburtsdatum (optional)</Label>
                <Input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => handleChange('birth_date', e.target.value)}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ready</SelectItem>
                  <SelectItem value="pending">Bearbeitung</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>
          </div>

          {driver && formData.email && (
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

          {!driver && (
            <>
              <Separator />
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <h3 className="font-semibold text-[#1e3a5f]">Einladung & Passwort</h3>
                  <p className="text-sm text-gray-500">
                    Beim Speichern wird automatisch eine E-Mail mit dem Passwort-Link gesendet.
                  </p>
                </div>
                {loginError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {loginError}
                  </div>
                )}
                {loginResult && (
                  <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <p>Einladungs-E-Mail wurde verarbeitet.</p>
                    {loginResult.loginUrl && (
                      <div className="flex items-center gap-2">
                        <Input value={loginResult.loginUrl} readOnly />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigator.clipboard?.writeText(loginResult.loginUrl || '')}
                        >
                          Link kopieren
                        </Button>
                      </div>
                    )}
                    {!loginResult.emailSent && loginResult.resetLink && (
                      <div className="flex items-center gap-2">
                        <Input value={loginResult.resetLink} readOnly />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigator.clipboard?.writeText(loginResult.resetLink || '')}
                        >
                          Reset-Link kopieren
                        </Button>
                      </div>
                    )}
                    {!loginResult.emailSent && (
                      <p className="text-xs text-emerald-700">
                        E-Mail konnte nicht gesendet werden. Bitte Link manuell weitergeben.
                      </p>
                    )}
                    <p className="text-xs text-emerald-700">
                      Status bleibt auf Bearbeitung bis der Fahrer sein Passwort gesetzt hat.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={onCancel}>
                        Zur Liste
                      </Button>
                      {createdDriverId && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            window.location.href = `/drivers?id=${createdDriverId}`;
                          }}
                        >
                          Profil anzeigen
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {!driver && createdDriverId && !loginResult && !loginCreating && (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <p>Profil wurde gespeichert.</p>
                    <p>Die Einladungs-E-Mail wird gesendet...</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={onCancel}>
                        Zur Liste
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          window.location.href = `/drivers?id=${createdDriverId}`;
                        }}
                      >
                        Profil anzeigen
                      </Button>
                    </div>
                  </div>
                )}
                {loginCreating && (
                  <div className="text-sm text-gray-500">
                    Login-Daten werden erstellt…
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* License Documents */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[#1e3a5f]">
              <FileText className="w-5 h-5" />
              <h3 className="font-semibold">Führerschein</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Führerscheinnummer (optional)</Label>
                <Input
                  value={formData.license_number}
                  onChange={(e) => handleChange('license_number', e.target.value)}
                  placeholder="z.B. DE1234567"
                />
              </div>
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
              <Label>Führerschein gültig bis (optional)</Label>
              <Input 
                type="date"
                value={formData.license_expiry}
                onChange={(e) => handleChange('license_expiry', e.target.value)}
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
            <Label>Notizen (optional)</Label>
            <Textarea 
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Interne Notizen zum Fahrer..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
