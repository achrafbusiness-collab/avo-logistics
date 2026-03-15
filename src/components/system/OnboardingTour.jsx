import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { appClient } from '@/api/appClient';
import { supabase } from '@/lib/supabaseClient';
import { Truck, Users, User, Settings, CheckCircle2, ChevronRight, Rocket } from 'lucide-react';

const STEPS = [
  {
    title: 'Willkommen bei TransferFleet',
    description:
      'Ihr KI-automatisiertes System für Fahrzeugüberführung. Diese kurze Tour zeigt Ihnen die wichtigsten Bereiche.',
    icon: Rocket,
    color: 'text-blue-600',
  },
  {
    title: 'Aufträge verwalten',
    description:
      'Unter "Aufträge" erstellen und verwalten Sie Fahrzeugüberführungen. Weisen Sie Fahrer zu und tracken Sie den Status in Echtzeit.',
    icon: Truck,
    color: 'text-slate-700',
  },
  {
    title: 'Fahrer anlegen',
    description:
      'Unter "Fahrer" legen Sie Ihr Team an. Fahrer erhalten automatisch Zugang zum Fahrer-Portal mit eigenem Login.',
    icon: Users,
    color: 'text-slate-700',
  },
  {
    title: 'Kunden & Rechnungen',
    description:
      'Unter "Kunden & Finanzen" verwalten Sie Ihre Kunden mit individuellen Preislisten und erstellen Rechnungen per Knopfdruck.',
    icon: User,
    color: 'text-slate-700',
  },
  {
    title: 'Jetzt einrichten',
    description:
      'Im nächsten Schritt hinterlegen Sie Ihre Unternehmensdaten, Bankverbindung und Logo — einmalig, dann automatisch auf allen Rechnungen und Protokollen.',
    icon: Settings,
    color: 'text-green-600',
  },
];

export default function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Prüfe sowohl localStorage als auch Datenbank
    const check = async () => {
      // Schnellcheck: localStorage
      if (localStorage.getItem('tf-onboarding-done')) {
        setChecked(true);
        return;
      }

      // DB-Check: Profil hat onboarding_completed?
      try {
        const user = await appClient.auth.getCurrentUser();
        if (!user) { setChecked(true); return; }

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.onboarding_completed) {
          // In localStorage cachen damit es nicht bei jedem Laden gecheckt wird
          localStorage.setItem('tf-onboarding-done', '1');
          setChecked(true);
          return;
        }

        // Neuer User → Tour zeigen
        setChecked(true);
        setTimeout(() => setOpen(true), 1200);
      } catch {
        setChecked(true);
      }
    };

    check();
  }, []);

  const handleClose = () => {
    markComplete();
    setOpen(false);
  };

  const markComplete = async () => {
    localStorage.setItem('tf-onboarding-done', '1');
    try {
      const user = await appClient.auth.getCurrentUser();
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', user.id);
      }
    } catch {
      // Silent
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      // Letzter Schritt → Zur Einstellungen-Seite
      markComplete();
      setOpen(false);
      navigate('/Settings?tab=company');
    }
  };

  if (!checked) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isLast ? 'bg-green-100' : 'bg-slate-100'}`}>
              <Icon className={`h-5 w-5 ${current.color}`} />
            </div>
            <DialogTitle className="text-base">{current.title}</DialogTitle>
          </div>
        </DialogHeader>

        <p className="text-sm text-slate-600 leading-relaxed">{current.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-[#1e3a5f]' : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                }`}
                aria-label={`Schritt ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-slate-500">
              Überspringen
            </Button>
            <Button
              size="sm"
              className={isLast ? 'bg-green-600 hover:bg-green-700' : 'bg-[#1e3a5f] hover:bg-[#2d5a8a]'}
              onClick={handleNext}
            >
              {isLast ? (
                <>Einrichten <Settings className="ml-2 h-4 w-4" /></>
              ) : (
                <>Weiter <ChevronRight className="ml-1 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
