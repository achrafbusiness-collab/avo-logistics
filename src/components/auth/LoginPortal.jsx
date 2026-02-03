import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { appClient } from '@/api/appClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, Mail, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n';

export default function LoginPortal({
  title,
  subtitle,
  cardTitle,
  successRedirect,
  emailPlaceholder,
  hintTitle,
  hintText,
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const publicSiteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || '').trim();
  const resetRedirect = publicSiteUrl
    ? `${publicSiteUrl.replace(/\/$/, '')}/reset-password`
    : `${window.location.origin}/reset-password`;

  useEffect(() => {
    const loadUser = async () => {
      const user = await appClient.auth.getCurrentUser();
      if (user) {
        window.location.href = successRedirect;
      }
    };
    loadUser();
  }, [successRedirect]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResetSent(false);
    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        throw new Error(t('login.errors.invalidEmail'));
      }
      const user = await appClient.auth.login({ email: cleanEmail, password });
      if (user?.must_reset_password) {
        window.location.href = "/reset-password";
        return;
      }
      window.location.href = successRedirect;
    } catch (err) {
      setError(err?.message || t('login.errors.loginFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setError('');
    const targetEmail = email.trim().toLowerCase();
    const query = targetEmail ? `?email=${encodeURIComponent(targetEmail)}` : '';
    window.location.href = `/reset-password${query}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative min-h-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,58,95,0.6),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.7),_transparent_60%)]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-10 px-4 py-12">
          <div className="w-full max-w-xl space-y-4 text-center">
            <div className="mx-auto flex items-center justify-center rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/70">
              <img
                src="/IMG_5222.JPG"
                alt={t('login.logoAlt')}
                className="h-28 w-auto object-contain drop-shadow-sm sm:h-36"
              />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white lg:text-5xl">
              {title}
            </h1>
            <p className="text-base text-white/70">
              {subtitle}
            </p>
            <Button asChild variant="ghost" className="text-white/80 hover:text-white">
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4 rtl-flip" />
                {t('login.actions.switchPortal')}
              </Link>
            </Button>
          </div>

          <Card className="w-full max-w-md border border-white/10 bg-white text-slate-900 shadow-2xl">
            <CardHeader className="space-y-4">
              <CardTitle className="flex items-center justify-center gap-2 text-[#1e3a5f]">
                <Lock className="w-5 h-5" />
                {cardTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="portal-email">{t('login.labels.email')}</Label>
                  <Input
                    id="portal-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={emailPlaceholder}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portal-password">{t('login.labels.password')}</Label>
                  <Input
                    id="portal-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.passwordPlaceholder')}
                    required
                  />
                </div>
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {resetSent && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {t('login.resetSent')}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8a]"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('login.actions.signIn')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleReset}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {t('login.actions.forgotPassword')}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-700">{hintTitle}</p>
                <p>{hintText}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
