import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Truck, Users, User, Settings, CheckCircle2, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    title: 'Willkommen bei TransferFleet',
    description:
      'Ihr KI-automatisiertes System für Fahrzeugüberführung. Diese kurze Tour zeigt Ihnen die wichtigsten Bereiche — dauert weniger als eine Minute.',
    icon: CheckCircle2,
    color: 'text-blue-600',
  },
  {
    title: 'Aufträge verwalten',
    description:
      'Unter "Aufträge" erstellen und verwalten Sie Fahrzeugüberführungen. Weisen Sie Fahrer zu, tracken Sie den Status und laden Sie Auslagen herunter.',
    icon: Truck,
    color: 'text-slate-700',
  },
  {
    title: 'Fahrer anlegen',
    description:
      'Unter "Fahrer" legen Sie Ihr Fahrer-Team an. Fahrer erhalten automatisch Zugang zum Fahrer-Portal mit eigenem Login.',
    icon: Users,
    color: 'text-slate-700',
  },
  {
    title: 'Kunden & Rechnungen',
    description:
      'Unter "Kunden & Finanzen" verwalten Sie Kunden, erstellen Rechnungen und behalten offene Posten im Blick.',
    icon: User,
    color: 'text-slate-700',
  },
  {
    title: 'Einstellungen konfigurieren',
    description:
      'Unter "App & Einstellungen" hinterlegen Sie Ihre Unternehmensdaten, Bankverbindung und Rechnungsdetails — einmalig, dann automatisch überall.',
    icon: Settings,
    color: 'text-slate-700',
  },
];

export default function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem('tf-onboarding-done');
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('tf-onboarding-done', '1');
    setOpen(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleClose();
    }
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
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
            <Button size="sm" className="bg-[#1e3a5f] hover:bg-[#2d5a8a]" onClick={handleNext}>
              {isLast ? (
                <>Loslegen <CheckCircle2 className="ml-2 h-4 w-4" /></>
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
