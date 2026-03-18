import React, { useEffect, useState } from 'react';
import { appClient } from '@/api/appClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Zap, Mail, Clock, Shield } from 'lucide-react';

const FEATURES = [
  'Unbegrenzte Aufträge & Fahrer',
  'KI-gestützter E-Mail-Import',
  'Live-Tracking auf der Karte',
  'Kunden- & Rechnungsverwaltung',
  'Digitale Fahrerprotokolle',
  'Statistiken & KPIs',
  'Rollen & Rechteverwaltung',
  'Persönlicher Support',
];

export default function Upgrade() {
  const [user, setUser] = useState(null);
  const [upgradeRequested, setUpgradeRequested] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    appClient.auth.getCurrentUser().then(setUser).catch(() => {});
  }, []);

  const trialStatus = user?.trialStatus;
  const daysLeft = trialStatus?.daysLeft ?? 0;
  const isExpired = trialStatus?.isExpired;

  const handleUpgradeRequest = async () => {
    setSending(true);
    try {
      await fetch('/api/request-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          email: user?.email,
          company_id: user?.company_id,
          full_name: user?.full_name,
        }),
      });
      setUpgradeRequested(true);
    } catch {
      setUpgradeRequested(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold">
          <Zap className="w-4 h-4" />
          Upgrade
        </div>
        <h1 className="text-3xl font-bold text-gray-900">
          {isExpired
            ? 'Ihre Testphase ist abgelaufen'
            : `Noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'} in der Testphase`}
        </h1>
        <p className="text-gray-500 max-w-md mx-auto">
          {isExpired
            ? 'Upgraden Sie jetzt, um TransferFleet weiter zu nutzen. Ihre Daten sind sicher gespeichert.'
            : 'Sichern Sie sich jetzt den vollen Zugang ohne Unterbrechung.'}
        </p>
      </div>

      {/* Pricing */}
      <Card className="border-2 border-cyan-500/30 bg-gradient-to-br from-slate-50 to-cyan-50/30">
        <CardContent className="p-8 text-center space-y-2">
          <p className="text-sm text-gray-500 uppercase tracking-wide font-medium">Einfaches Preismodell</p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-5xl font-bold text-[#1e3a5f]">30</span>
            <span className="text-xl text-gray-500">€</span>
          </div>
          <p className="text-gray-600">pro Fahrer-Slot / Monat</p>
          <p className="text-xs text-gray-400 pt-2">Keine Grundgebühr. Keine versteckten Kosten. Buchen Sie so viele Fahrer-Slots wie Sie brauchen. Erhöhung jederzeit, Reduzierung zum Monatsende.</p>
        </CardContent>
      </Card>

      <Card className="border-2 border-[#1e3a5f] shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">TransferFleet Pro</CardTitle>
          <p className="text-gray-500 text-sm">Alles inklusive — keine Feature-Limits</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500 shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="border-t pt-6 space-y-4">
            {upgradeRequested ? (
              <div className="text-center space-y-2 py-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg">Anfrage erhalten!</h3>
                <p className="text-gray-500 text-sm">
                  Wir melden uns innerhalb von 24 Stunden bei Ihnen.
                </p>
              </div>
            ) : (
              <>
                <Button
                  onClick={handleUpgradeRequest}
                  disabled={sending}
                  className="w-full bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8a] hover:from-[#24456e] hover:to-[#356796] text-white py-6 text-lg font-semibold"
                >
                  <Zap className="w-5 h-5 mr-2" />
                  {sending ? 'Wird gesendet...' : 'Upgrade anfragen'}
                </Button>
                <p className="text-center text-xs text-gray-400">
                  Wir kontaktieren Sie persönlich für die Einrichtung.
                </p>
              </>
            )}
          </div>

          <div className="border-t pt-4 flex justify-center text-sm">
            <div className="flex items-center gap-3 text-gray-600">
              <Mail className="w-4 h-4 text-[#1e3a5f]" />
              <span>info@transferfleet.de</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-gray-400 pt-2">
            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> DSGVO-konform</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Keine Bindung</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
