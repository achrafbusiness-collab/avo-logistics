import React from 'react';
import LoginPortal from '@/components/auth/LoginPortal';
import { createPageUrl } from '@/utils';

export default function LoginStaff() {
  return (
    <LoginPortal
      title="Mitarbeiter‑Portal"
      subtitle="Für Disposition, Aufträge, Kunden und Fahrer‑Management."
      cardTitle="Mitarbeiter‑Login"
      successRedirect={createPageUrl('Dashboard')}
      emailPlaceholder="mitarbeiter@avo-logistics.app"
      hintTitle="Hinweis"
      hintText="Zugriffe werden zentral über Team AVO verwaltet."
    />
  );
}
