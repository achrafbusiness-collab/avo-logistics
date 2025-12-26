import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from "lucide-react";

const roles = [
  { value: "admin", label: "Admin" },
  { value: "dispatcher", label: "Disponent" },
  { value: "minijobber", label: "Minijobber" },
];

const employmentTypes = [
  { value: "minijob", label: "Minijob" },
  { value: "teilzeit", label: "Teilzeit" },
  { value: "vollzeit", label: "Vollzeit" },
];

const permissionOptions = [
  { key: "Dashboard", label: "Dashboard" },
  { key: "Orders", label: "Aufträge" },
  { key: "Drivers", label: "Fahrer" },
  { key: "Customers", label: "Kunden" },
  { key: "Checklists", label: "Protokolle" },
  { key: "Search", label: "Suche" },
  { key: "AIImport", label: "AI Import" },
  { key: "AVOAI", label: "AVO AI" },
  { key: "AppConnection", label: "App-Verbindung" },
  { key: "TeamAVO", label: "Team AVO" },
];

const defaultPermissions = permissionOptions.reduce((acc, item) => {
  acc[item.key] = false;
  return acc;
}, {});

const buildProfileForm = (profile) => ({
  id: profile?.id || "",
  email: profile?.email || "",
  full_name: profile?.full_name || "",
  role: profile?.role || "minijobber",
  position: profile?.position || "",
  employment_type: profile?.employment_type || "",
  address: profile?.address || "",
  phone: profile?.phone || "",
  id_front_url: profile?.id_front_url || "",
  id_back_url: profile?.id_back_url || "",
  is_active: profile?.is_active ?? true,
  permissions: {
    ...defaultPermissions,
    ...(profile?.permissions || {}),
  },
});

export default function TeamAVO() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(buildProfileForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [uploadingId, setUploadingId] = useState({ front: false, back: false });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("minijobber");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId),
    [profiles, selectedId]
  );

  useEffect(() => {
    const load = async () => {
      const user = await appClient.auth.getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const data = await fetchProfiles();
        setProfiles(data || []);
        if (data?.length) {
          setSelectedId(data[0].id);
          setForm(buildProfileForm(data[0]));
        }
      } catch (err) {
        setError(err?.message || "Konnte Profile nicht laden.");
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (selectedProfile) {
      setForm(buildProfileForm(selectedProfile));
    }
  }, [selectedProfile]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePermissionToggle = (key) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const refreshProfiles = async () => {
    try {
      const data = await fetchProfiles();
      setProfiles(data || []);
      if (data?.length) {
        const next = data.find((item) => item.id === selectedId) || data[0];
        setSelectedId(next.id);
        setForm(buildProfileForm(next));
      }
    } catch (err) {
      setError(err?.message || "Konnte Profile nicht laden.");
    }
  };

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const fetchProfiles = async () => {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("Nicht angemeldet.");
    }
    const response = await fetch("/api/admin/list-profiles", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || "Profile konnten nicht geladen werden.");
    }
    return payload.data || [];
  };

  const uploadIdDocument = async (side, file) => {
    if (!selectedProfile) {
      setError("Bitte zuerst ein Profil auswählen.");
      return;
    }
    if (!file) return;
    const ext = file.name.split(".").pop() || "png";
    const path = `${selectedProfile.id}/${side}-${Date.now()}.${ext}`;
    setUploadingId((prev) => ({ ...prev, [side]: true }));
    setError("");
    try {
      const { error: uploadError } = await supabase.storage
        .from("employee-ids")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { data } = supabase.storage.from("employee-ids").getPublicUrl(path);
      handleFormChange(side === "front" ? "id_front_url" : "id_back_url", data.publicUrl);
    } catch (err) {
      setError(err?.message || "Upload fehlgeschlagen.");
    } finally {
      setUploadingId((prev) => ({ ...prev, [side]: false }));
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setError("Bitte eine E-Mail angeben.");
      return;
    }
    setInviting(true);
    setError("");
    setMessage("");
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }

      const response = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          redirectTo: `${window.location.origin}/reset-password`,
          profile: {
            role: inviteRole,
            permissions: defaultPermissions,
            is_active: false,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || "Einladung fehlgeschlagen.");
      }
      if (payload?.data?.emailSent === false && payload?.data?.actionLink) {
        setMessage(`Einladung erstellt, E-Mail konnte nicht gesendet werden. Link: ${payload.data.actionLink}`);
      } else {
        setMessage("Einladung wurde gesendet. Konto wartet auf Freigabe.");
      }
      setInviteEmail("");
      setInviteRole("minijobber");
      await refreshProfiles();
    } catch (err) {
      setError(err?.message || "Einladung fehlgeschlagen.");
    } finally {
      setInviting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updates = {
        full_name: form.full_name,
        role: form.role,
        position: form.position,
        employment_type: form.employment_type,
        address: form.address,
        phone: form.phone,
        id_front_url: form.id_front_url,
        id_back_url: form.id_back_url,
        permissions: form.permissions,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
      const response = await fetch("/api/admin/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: selectedProfile.id, updates }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Speichern fehlgeschlagen.");
      }
      setMessage("Profil gespeichert.");
      await refreshProfiles();
    } catch (err) {
      setError(err?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (selectedProfile.id === currentUser?.id) {
        throw new Error("Du kannst dein eigenes Konto nicht löschen.");
      }
      const token = await getAuthToken();
      if (!token) {
        throw new Error("Nicht angemeldet.");
      }
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: selectedProfile.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Loeschen fehlgeschlagen.");
      }
      setMessage("Profil wurde geloescht.");
      setDeleteConfirmOpen(false);
      await refreshProfiles();
    } catch (err) {
      setError(err?.message || "Loeschen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-[#1e3a5f]" />
          Team AVO
        </h1>
        <p className="text-slate-500">
          Verwalte Konten, Rollen und Seiten-Zugriffe für dein Team.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#1e3a5f]" />
              Neues Konto einladen
            </CardTitle>
            <p className="text-sm text-slate-500">Mitarbeiter erhält E-Mail zum Passwort setzen.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@firma.de"
              className="sm:w-64"
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleInvite}
              disabled={inviting}
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            >
              {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Einladen
            </Button>
          </div>
        </CardHeader>
      </Card>

      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Konten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profiles.length === 0 ? (
              <p className="text-sm text-slate-500">
                Noch keine Profile. Oben kannst du neue Konten einladen.
              </p>
            ) : (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedId(profile.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                    selectedId === profile.id
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {profile.full_name || profile.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    {profile.role || "minijobber"}
                    {!profile.is_active ? " • wartend" : ""}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profil</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Vollständiger Name</Label>
                <Input value={form.full_name} onChange={(e) => handleFormChange("full_name", e.target.value)} />
              </div>
              <div>
                <Label>E-Mail</Label>
                <Input value={form.email} disabled />
              </div>
              <div>
                <Label>Rolle</Label>
                <Select value={form.role} onValueChange={(value) => handleFormChange("role", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Position</Label>
                <Input value={form.position} onChange={(e) => handleFormChange("position", e.target.value)} />
              </div>
              <div>
                <Label>Beschäftigung</Label>
                <Select value={form.employment_type} onValueChange={(value) => handleFormChange("employment_type", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {employmentTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Adresse</Label>
                <Input value={form.address} onChange={(e) => handleFormChange("address", e.target.value)} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={form.phone} onChange={(e) => handleFormChange("phone", e.target.value)} />
              </div>
              <div className="flex items-center gap-3 pt-4">
                <Switch checked={form.is_active} onCheckedChange={(value) => handleFormChange("is_active", value)} />
                <span className="text-sm text-slate-600">Aktiv</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ausweis / Dokumente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Ausweis Vorderseite</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => uploadIdDocument("front", e.target.files?.[0])}
                />
                {uploadingId.front && <p className="text-xs text-slate-500">Upload läuft…</p>}
                {form.id_front_url && (
                  <img
                    src={form.id_front_url}
                    alt="Ausweis Vorderseite"
                    className="mt-2 h-32 w-full rounded-lg border object-cover"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Ausweis Rückseite</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => uploadIdDocument("back", e.target.files?.[0])}
                />
                {uploadingId.back && <p className="text-xs text-slate-500">Upload läuft…</p>}
                {form.id_back_url && (
                  <img
                    src={form.id_back_url}
                    alt="Ausweis Rückseite"
                    className="mt-2 h-32 w-full rounded-lg border object-cover"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Seiten-Zugriffe</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {permissionOptions.map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={!!form.permissions[item.key]}
                    onCheckedChange={() => handlePermissionToggle(item.key)}
                  />
                  {item.label}
                </label>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50"
              disabled={!selectedProfile || selectedProfile?.id === currentUser?.id}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Konto loeschen
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !selectedProfile}
              className="bg-[#1e3a5f] hover:bg-[#2d5a8a]"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Profil speichern
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konto wirklich loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Profil und der Login-Zugang werden dauerhaft entfernt. Diese Aktion kann nicht rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Endgueltig loeschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
