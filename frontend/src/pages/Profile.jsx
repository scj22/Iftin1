import { useState } from 'react';
import { KeyRound, Lock, LogOut, Mail, Save, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatDateTime, initials } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Card, CardHeader, Field, Input, PageHeader } from '../components/ui/index.jsx';

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async (event) => {
    event.preventDefault();
    setSavingName(true);
    try {
      await updateProfile({ name: name.trim() });
      toast.success('Your profile has been updated.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordErrors({});
    try {
      await api.auth.changePassword(passwords);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Your password has been changed.');
    } catch (error) {
      const fieldErrors = {};
      error.details?.forEach((detail) => {
        fieldErrors[detail.field] = detail.message;
      });
      setPasswordErrors({ ...fieldErrors, form: error.details ? undefined : error.message });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Profile" description="Your account details and sign-in security." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex flex-col items-center text-center">
            <span className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-somali-500 text-2xl font-bold text-white shadow-lg">
              {initials(user?.name)}
            </span>
            <p className="mt-4 text-lg font-semibold text-ink-900 dark:text-ink-50">{user?.name}</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">{user?.email}</p>
            <dl className="mt-5 w-full space-y-2 border-t border-ink-200/70 pt-4 text-left dark:border-white/8">
              <div className="flex justify-between gap-3 text-xs">
                <dt className="text-ink-500 dark:text-ink-400">Member since</dt>
                <dd className="font-medium text-ink-700 dark:text-ink-200">
                  {formatDateTime(user?.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <dt className="text-ink-500 dark:text-ink-400">Last sign in</dt>
                <dd className="font-medium text-ink-700 dark:text-ink-200">
                  {formatDateTime(user?.lastLoginAt)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <dt className="text-ink-500 dark:text-ink-400">Home city</dt>
                <dd className="font-medium text-ink-700 dark:text-ink-200">
                  {user?.preferences?.homeCity ?? 'Mogadishu'}
                </dd>
              </div>
            </dl>
            <Button variant="outline" icon={LogOut} onClick={logout} className="mt-5 w-full">
              Sign out
            </Button>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <CardHeader icon={User} title="Your details" description="How your name appears in the app" />
            <form onSubmit={saveName} className="mt-4 space-y-4">
              <Field label="Full name" htmlFor="profile-name">
                <Input
                  id="profile-name"
                  icon={User}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                />
              </Field>
              <Field label="Email address" htmlFor="profile-email" hint="Cannot be changed">
                <Input id="profile-email" icon={Mail} value={user?.email ?? ''} disabled readOnly />
              </Field>
              <Button
                type="submit"
                icon={Save}
                loading={savingName}
                disabled={name.trim() === user?.name || name.trim().length < 2}
              >
                Save changes
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <CardHeader
              icon={KeyRound}
              title="Change password"
              description="Passwords are hashed with bcrypt and never stored in plain text"
            />
            <form onSubmit={changePassword} className="mt-4 space-y-4">
              {passwordErrors.form && (
                <p role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
                  {passwordErrors.form}
                </p>
              )}
              <Field
                label="Current password"
                htmlFor="current-password"
                error={passwordErrors.currentPassword}
              >
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  icon={Lock}
                  value={passwords.currentPassword}
                  onChange={(event) =>
                    setPasswords((current) => ({ ...current, currentPassword: event.target.value }))
                  }
                  required
                />
              </Field>
              <Field
                label="New password"
                htmlFor="new-password"
                hint="At least 8 characters, with a number"
                error={passwordErrors.newPassword}
              >
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  icon={Lock}
                  value={passwords.newPassword}
                  onChange={(event) =>
                    setPasswords((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  required
                />
              </Field>
              <Button
                type="submit"
                icon={KeyRound}
                loading={savingPassword}
                disabled={!passwords.currentPassword || passwords.newPassword.length < 8}
              >
                Change password
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
