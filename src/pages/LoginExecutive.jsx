import React from 'react';
import LoginPortal from '@/components/auth/LoginPortal';
import { createPageUrl } from '@/utils';

export default function LoginExecutive() {
  return (
    <LoginPortal
      title="Geschäftsführung & Buchhaltung"
      subtitle="Finanzen, Abrechnung und Gesamtübersicht auf einen Blick."
      cardTitle="Executive‑Login"
      successRedirect={createPageUrl('Dashboard')}
      emailPlaceholder="buchhaltung@avo-logistics.app"
      hintTitle="Hinweis"
      hintText="Bitte sichere E‑Mail und starkes Passwort verwenden."
    />
  );
}
