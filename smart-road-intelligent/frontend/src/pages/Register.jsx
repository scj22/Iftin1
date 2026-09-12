import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cn } from '../lib/format.js';
import { AuthLayout } from './authLayout.jsx';
import { Button, Field, Input } from '../components/ui/index.jsx';

// Mirrors the rules the API enforces, so the two cannot disagree.
const RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { id: 'letter', label: 'Contains a letter', test: (value) => /[a-zA-Z]/.test(value) },
  { id: 'number', label: 'Contains a number', test: (value) => /[0-9]/.test(value) },
];

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const passed = useMemo(
    () => RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password],
  );
  const strength = passed.filter((rule) => rule.ok).length;
  const canSubmit = strength === RULES.length && form.name.trim().length >= 2 && form.email;

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const user = await register(form);
      toast.success(`Welcome to Smart Road, ${user.name.split(' ')[0]}.`);
      navigate('/app', { replace: true });
    } catch (error) {
      const fieldErrors = {};
      error.details?.forEach((detail) => {
        fieldErrors[detail.field] = detail.message;
      });
      setErrors({ ...fieldErrors, form: error.details ? undefined : error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Save the routes you plan and revisit them whenever you need."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.form && (
          <p role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
            {errors.form}
          </p>
        )}

        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            autoComplete="name"
            icon={User}
            placeholder=" your name"
            value={form.name}
            onChange={update('name')}
            invalid={Boolean(errors.name)}
            required
          />
        </Field>

        <Field label="Email address" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            icon={Mail}
            placeholder="you@example.com"
            value={form.email}
            onChange={update('email')}
            invalid={Boolean(errors.email)}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            icon={Lock}
            placeholder="Choose a strong password"
            value={form.password}
            onChange={update('password')}
            invalid={Boolean(errors.password)}
            required
          />
        </Field>

        {form.password && (
          <div className="animate-fade-in space-y-2">
            <div className="flex gap-1">
              {RULES.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors duration-300',
                    index < strength
                      ? strength === 3
                        ? 'bg-emerald-500'
                        : strength === 2
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      : 'bg-ink-200 dark:bg-white/10',
                  )}
                />
              ))}
            </div>
            <ul className="space-y-1">
              {passed.map((rule) => (
                <li
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-1.5 text-[11px] transition-colors',
                    rule.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-400',
                  )}
                >
                  <Check
                    className={cn('size-3 shrink-0', !rule.ok && 'opacity-30')}
                    aria-hidden
                  />
                  {rule.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          type="submit"
          loading={submitting}
          disabled={!canSubmit}
          className="w-full"
          size="lg"
          iconRight={ArrowRight}
        >
          Create account
        </Button>

   
      </form>

      <Link
        to="/"
        className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-500 hover:text-brand-600 dark:text-ink-400"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to home
      </Link>
    </AuthLayout>
  );
}
