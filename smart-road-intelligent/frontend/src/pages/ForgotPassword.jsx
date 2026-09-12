import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Info, KeyRound, Lock, Mail } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { AuthLayout } from './authLayout.jsx';
import { Button, Field, Input } from '../components/ui/index.jsx';

/**
 * Password reset without pretending email works.
 *
 * The backend generates a real single-use token; because no mail provider is
 * configured, it returns the token directly outside production. The UI says so
 * plainly rather than showing a "check your inbox" message that would never
 * arrive.
 */
export default function ForgotPassword() {
  const toast = useToast();
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [devToken, setDevToken] = useState(null);
  const [emailDelivery, setEmailDelivery] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const requestReset = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.auth.forgotPassword({ email });
      setEmailDelivery(result.emailDelivery);
      setDevToken(result.devResetToken ?? null);
      if (result.devResetToken) setToken(result.devResetToken);
      setStep('reset');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.auth.resetPassword({ token, password });
      toast.success('Your password has been reset. You can sign in now.');
      setStep('done');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'done') {
    return (
      <AuthLayout title="Password updated" subtitle="You can sign in with your new password.">
        <Button to="/login" className="w-full" size="lg">
          Go to sign in
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={step === 'request' ? 'Reset your password' : 'Choose a new password'}
      subtitle={
        step === 'request'
          ? 'Enter the address you signed up with and we will create a reset token.'
          : 'Paste your reset token and pick a new password.'
      }
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {step === 'request' ? (
        <form onSubmit={requestReset} className="space-y-4" noValidate>
          <Field label="Email address" htmlFor="reset-email">
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              icon={Mail}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Create reset token
          </Button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-4" noValidate>
          {/* Honest statement about delivery */}
          {emailDelivery && !emailDelivery.configured && (
            <div className="flex items-start gap-2.5 rounded-xl border border-somali-500/30 bg-somali-500/8 p-3.5">
              <Info className="mt-0.5 size-4 shrink-0 text-somali-500" aria-hidden />
              <div className="min-w-0 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                <p className="font-semibold">Email delivery is not configured.</p>
                <p className="mt-1 text-ink-600 dark:text-ink-300">{emailDelivery.reason}</p>
                {devToken && (
                  <div className="mt-2.5">
                    <p className="mb-1 text-[11px] text-ink-500 dark:text-ink-400">
                      Your reset token, shown here because this is a local build:
                    </p>
                    <div className="flex items-center gap-2 rounded-lg bg-white p-2 dark:bg-ink-900">
                      <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-700 dark:text-ink-200">
                        {devToken}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(devToken);
                          toast.success('Token copied.');
                        }}
                        aria-label="Copy reset token"
                        className="shrink-0 rounded p-1 text-ink-400 hover:text-brand-600"
                      >
                        <Copy className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                )}
                {!devToken && (
                  <p className="mt-2 text-ink-600 dark:text-ink-300">
                    If an account exists for that address, a token was created but cannot be
                    delivered.
                  </p>
                )}
              </div>
            </div>
          )}

          <Field label="Reset token" htmlFor="reset-token">
            <Input
              id="reset-token"
              icon={KeyRound}
              placeholder="Paste your reset token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </Field>

          <Field label="New password" htmlFor="new-password" hint="At least 8 characters, with a number">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              icon={Lock}
              placeholder="Choose a new password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Reset password
          </Button>
        </form>
      )}

      <Link
        to="/login"
        className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-500 hover:text-brand-600 dark:text-ink-400"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
