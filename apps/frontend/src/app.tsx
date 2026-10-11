import { Activity, Blocks, LayoutDashboard, Settings2 } from 'lucide-react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { Card } from './components/ui/card';

const pages = {
	raeume: {
		title: 'Räume',
		description: 'Räume und Bereiche werden später frei konfigurierbar dargestellt.',
		icon: LayoutDashboard,
	},
	energie: {
		title: 'Energie',
		description: 'Energieflüsse und Historien werden nach der Anbindung von Datenpunkten ergänzt.',
		icon: Activity,
	},
	geraete: {
		title: 'Geräte',
		description: 'Geräteansichten entstehen aus konfigurierbaren Widgets, nicht aus einer festen Klassifizierung.',
		icon: Blocks,
	},
	einstellungen: {
		title: 'Einstellungen',
		description:
			'Darstellung, Berechtigungen und Visualisierungseinstellungen folgen in einer späteren Ausbaustufe.',
		icon: Settings2,
	},
};

export function App(): JSX.Element {
	return (
		<AppShell>
			<Routes>
				<Route
					path="/"
					element={<Overview />}
				/>
				<Route
					path="/raeume"
					element={<Placeholder {...pages.raeume} />}
				/>
				<Route
					path="/energie"
					element={<Placeholder {...pages.energie} />}
				/>
				<Route
					path="/geraete"
					element={<Placeholder {...pages.geraete} />}
				/>
				<Route
					path="/einstellungen"
					element={<Placeholder {...pages.einstellungen} />}
				/>
			</Routes>
		</AppShell>
	);
}

function Overview(): JSX.Element {
	return (
		<section className="space-y-7">
			<div>
				<p className="text-sm font-semibold text-sky-600 dark:text-sky-400">Willkommen bei NextUI</p>
				<h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
					Deine Visualisierung, frei konfigurierbar.
				</h2>
				<p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
					Dieses Grundgerüst trennt Navigation, Layout und künftige Widgets. Noch werden keine ioBroker-Daten
					dargestellt.
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<InfoCard
					title="Widget Registry"
					description="Bereit für konfigurierbare, adapterunabhängige Widgets."
					icon={<Blocks size={22} />}
				/>
				<InfoCard
					title="Sichere Anbindung"
					description="Status- und spätere Datenzugriffe bleiben über die Adapter-API gekapselt."
					icon={<Activity size={22} />}
				/>
				<InfoCard
					title="Responsive Layouts"
					description="Navigation und Inhalte passen sich Touchscreens und großen Displays an."
					icon={<LayoutDashboard size={22} />}
				/>
			</div>
		</section>
	);
}

function Placeholder({
	title,
	description,
	icon: Icon,
}: {
	title: string;
	description: string;
	icon: typeof Activity;
}): JSX.Element {
	return (
		<section className="space-y-5">
			<div>
				<p className="text-sm font-semibold text-sky-600 dark:text-sky-400">Vorbereitung</p>
				<h2 className="mt-1 text-3xl font-bold tracking-tight">{title}</h2>
			</div>
			<Card className="max-w-2xl">
				<Icon
					className="mb-4 text-sky-600 dark:text-sky-400"
					size={28}
				/>
				<h3 className="text-lg font-bold">Ansicht in Vorbereitung</h3>
				<p className="mt-2 leading-6 text-slate-600 dark:text-slate-300">{description}</p>
			</Card>
		</section>
	);
}

function InfoCard({
	title,
	description,
	icon,
}: {
	title: string;
	description: string;
	icon: JSX.Element;
}): JSX.Element {
	return (
		<Card>
			<div className="mb-5 inline-flex rounded-xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
				{icon}
			</div>
			<h3 className="font-bold">{title}</h3>
			<p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
		</Card>
	);
}
