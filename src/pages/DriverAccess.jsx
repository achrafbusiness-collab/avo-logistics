import React from 'react';
import LoginPortal from '@/components/auth/LoginPortal';
import { createPageUrl } from '@/utils';
import { useI18n } from '@/i18n';

export default function DriverAccess() {
  const { t } = useI18n();
  return (
    <LoginPortal
      title={t('login.driver.title')}
      subtitle={t('login.driver.subtitle')}
      cardTitle={t('login.driver.cardTitle')}
      successRedirect={createPageUrl('DriverOrders')}
      emailPlaceholder={t('login.driver.emailPlaceholder')}
      hintTitle={t('login.hintTitle')}
      hintText={t('login.hintText')}
    />
  );
}
