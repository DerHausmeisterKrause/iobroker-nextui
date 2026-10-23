import { Cpu, Database, DoorOpen, House, Menu, Moon, Settings, Sun, X, Zap } from 'lucide-react';
import { type PropsWithChildren, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from './theme-provider';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const navigation = [
	{ label: 'Übersicht', to: '/', icon: House },
	{ label: 'Räume', to: '/raeume', icon: DoorOpen },
	{ label: 'Energie', to: '/energie', icon: Zap },
	{ label: 'Geräte', to: '/geraete', icon: Cpu },
	{ label: 'Datenpunkte', to: '/datenpunkte', icon: Database },
	{ label: 'Einstellungen', to: '/einstellungen', icon: Settings },
];

const pageNames: Record<string, string> = {
	'/': 'Übersicht',
	'/raeume': 'Räume',
	'/energie': 'Energie',
	'/geraete': 'Geräte',
	'/datenpunkte': 'Datenpunkte',
	'/einstellungen': 'Einstellungen',
};

export function AppShell({ children }: PropsWithChildren): JSX.Element {
	const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
	const { pathname } = useLocation();
	const { theme, toggleTheme } = useTheme();
	const closeNavigation = (): void => setMobileNavigationOpen(false);

	return (
		<div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
			<aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:block">
				<Brand />
				<Navigation onNavigate={closeNavigation} />
			</aside>
			{mobileNavigationOpen && (
				<div
					className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
					onClick={closeNavigation}
				>
					<aside
						className="h-full w-72 bg-white p-5 shadow-2xl dark:bg-slate-900"
						onClick={event => event.stopPropagation()}
					>
						<div className="flex items-center justify-between">
							<Brand />
							<Button
								aria-label="Navigation schließen"
								variant="ghost"
								onClick={closeNavigation}
							>
								<X size={20} />
							</Button>
						</div>
						<Navigation onNavigate={closeNavigation} />
					</aside>
				</div>
			)}
			<div className="lg:pl-72">
				<header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-slate-200/80 bg-slate-50/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-7">
					<div className="flex items-center gap-3">
						<Button
							aria-label="Navigation öffnen"
							variant="ghost"
							className="lg:hidden"
							onClick={() => setMobileNavigationOpen(true)}
						>
							<Menu size={20} />
						</Button>
						<h1 className="text-lg font-bold tracking-tight">{pageNames[pathname] ?? 'NextUI'}</h1>
					</div>
					<Button
						aria-label="Farbschema wechseln"
						variant="ghost"
						onClick={toggleTheme}
					>
						{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
					</Button>
				</header>
				<main className="mx-auto w-full max-w-7xl p-4 sm:p-7">{children}</main>
			</div>
		</div>
	);
}

function Brand(): JSX.Element {
	return (
		<div className="mb-8 flex items-center gap-3">
			<img
				src="/nextui-icon.png"
				alt=""
				aria-hidden="true"
				className="size-10 rounded-xl shadow-lg shadow-sky-600/15"
			/>
			<div>
				<div className="font-bold tracking-tight">NextUI</div>
				<div className="text-xs text-slate-500 dark:text-slate-400">ioBroker Visualisierung</div>
			</div>
		</div>
	);
}

function Navigation({ onNavigate }: { onNavigate: () => void }): JSX.Element {
	return (
		<nav
			aria-label="Hauptnavigation"
			className="space-y-1"
		>
			{navigation.map(({ label, to, icon: Icon }) => (
				<NavLink
					key={to}
					to={to}
					end={to === '/'}
					onClick={onNavigate}
					className={({ isActive }) =>
						cn(
							'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition',
							isActive
								? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
								: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
						)
					}
				>
					<Icon size={19} />
					{label}
				</NavLink>
			))}
		</nav>
	);
}
