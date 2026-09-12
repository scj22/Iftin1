import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BrainCircuit,
  House,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Navigation,
  Settings,
  Sun,
  User,
  Waypoints,
  X,
} from 'lucide-react';
import { ACCOUNT_ITEMS, NAV_ITEMS } from '../../lib/constants.js';
import { cn, initials } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Logo, LogoMark } from '../brand/Logo.jsx';
import { Button } from '../ui/index.jsx';
import { ServiceStatusBanner } from './ServiceStatus.jsx';

const ICONS = {
  House,
  LayoutDashboard,
  Navigation,
  Waypoints,
  History,
  BrainCircuit,
  User,
  Settings,
};

/** Sidebar on desktop, slide-over drawer plus bottom bar on mobile. */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  // Close the drawer whenever navigation happens.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const visibleNav = NAV_ITEMS.filter((item) => !item.requiresAuth || isAuthenticated);
  const visibleAccount = ACCOUNT_ITEMS.filter((item) => !item.requiresAuth || isAuthenticated);

  return (
    <div className="flex h-dvh overflow-hidden bg-ink-50 dark:bg-ink-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-200/70 bg-white lg:flex dark:border-white/8 dark:bg-ink-900">
        <div className="flex h-16 items-center px-5">
          <Link to="/app" className="rounded-lg">
            <Logo />
          </Link>
        </div>
        <SidebarNav items={visibleNav} accountItems={visibleAccount} />
        <SidebarFooter user={user} isAuthenticated={isAuthenticated} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[1000] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fade-in flex-col border-r border-ink-200/70 bg-white shadow-2xl dark:border-white/8 dark:bg-ink-900">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 dark:hover:bg-white/10"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <SidebarNav items={visibleNav} accountItems={visibleAccount} />
            <SidebarFooter user={user} isAuthenticated={isAuthenticated} onLogout={logout} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenDrawer={() => setDrawerOpen(true)} />
        <ServiceStatusBanner />
        <main className="min-h-0 flex-1 overflow-y-auto pb-16 lg:pb-0">
          <Outlet />
        </main>
        <MobileTabBar items={visibleNav} />
      </div>
    </div>
  );
}

function SidebarNav({ items, accountItems }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main">
      {items.map((item) => (
        <SidebarLink key={item.to} item={item} />
      ))}

      {accountItems.length > 0 && (
        <>
          <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Account
          </p>
          {accountItems.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </>
      )}
    </nav>
  );
}

function SidebarLink({ item }) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-brand-500/12 text-brand-700 dark:text-brand-300'
            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/6 dark:hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-500"
              aria-hidden
            />
          )}
          <Icon className="size-4.5 shrink-0" aria-hidden />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function SidebarFooter({ user, isAuthenticated, onLogout }) {
  return (
    <div className="border-t border-ink-200/70 p-3 dark:border-white/8">
      {isAuthenticated ? (
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">
              {user?.name}
            </p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-red-600 dark:hover:bg-white/10"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <Button to="/login" variant="outline" size="sm" icon={LogIn} className="w-full">
          Sign in to save routes
        </Button>
      )}
    </div>
  );
}

function Topbar({ onOpenDrawer }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-200/70 bg-white/80 px-4 backdrop-blur-xl dark:border-white/8 dark:bg-ink-900/80">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-ink-600 transition hover:bg-ink-100 lg:hidden dark:text-ink-300 dark:hover:bg-white/10"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <Link to="/app" className="lg:hidden">
        <LogoMark className="size-8" />
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}

export function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'flex items-center gap-0.5 rounded-xl bg-ink-100 p-1 dark:bg-white/6',
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            onClick={() => setTheme(option.value)}
            className={cn(
              'grid size-7 place-items-center rounded-lg transition-all duration-150',
              active
                ? 'bg-white text-brand-600 shadow-sm dark:bg-ink-700 dark:text-brand-400'
                : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

function MobileTabBar({ items }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[900] flex border-t border-ink-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden dark:border-white/8 dark:bg-ink-900/95"
    >
      {items.slice(0, 5).map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-ink-500 dark:text-ink-400',
              )
            }
          >
            <Icon className="size-5" aria-hidden />
            <span className="max-w-full truncate px-1">{item.label.split(' ').at(-1)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
