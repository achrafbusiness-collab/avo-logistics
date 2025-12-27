import React from 'react';
import LoginPortal from '@/components/auth/LoginPortal';
import { createPageUrl } from '@/utils';

export default function LoginDriver() {
  return (
    <LoginPortal
      title="Fahrer‑Portal"
      subtitle="Bitte melde dich an, um deine Aufträge zu sehen und Protokolle zu erstellen."
      cardTitle="Fahrer‑Login"
      successRedirect={createPageUrl('DriverOrders')}
      emailPlaceholder="fahrer@avo-logistics.app"
      hintTitle="Hinweis"
      hintText="Bei Problemen bitte an den Administrator wenden."
    />
  );
}
