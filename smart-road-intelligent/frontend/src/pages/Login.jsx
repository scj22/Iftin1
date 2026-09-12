import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Compass, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AuthLayout } from './authLayout.jsx';
import { Button, Field, Input } from '../components/ui/index.jsx';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const user = await login(form);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      navigate(location.state?.from?.pathname ?? '/app', { replace: true });
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
      title="Welcome back"
      subtitle="Sign in to save your routes and revisit past journeys."
      footer={
        <>
          New to Smart Road?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Create an account
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

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password}
          hint={
            <Link to="/forgot-password" className="text-brand-600 hover:underline dark:text-brand-400">
              Forgot password?
            </Link>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            icon={Lock}
            placeholder="Your password"
            value={form.password}
            onChange={update('password')}
            invalid={Boolean(errors.password)}
            required
          />
        </Field>

        <Button type="submit" loading={submitting} className="w-full" size="lg" iconRight={ArrowRight}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-200 dark:bg-white/10" />
        <span className="text-xs text-ink-400">or</span>
        <span className="h-px flex-1 bg-ink-200 dark:bg-white/10" />
      </div>

      <Button to="/app/navigate" variant="outline" icon={Compass} className="mt-4 w-full">
        Continue without an account
      </Button>
      <p className="mt-2 text-center text-[11px] text-ink-400">
        Navigation and traffic work without signing in. An account only adds saved history.
      </p>

    </AuthLayout>
  );
}
