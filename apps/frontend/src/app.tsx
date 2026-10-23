import { Activity, Blocks, LayoutDashboard, Settings2 } from 'lucide-react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { Card } from './components/ui/card';
import { DatapointBrowser } from './features/datapoints/datapoint-browser';
import { DashboardWidgets } from './features/widgets/dashboard-widgets';

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
				<Route
					path="/datenpunkte"
					element={<DatapointBrowser />}
				/>
			</Routes>
		</AppShell>
	);
}

function Overview(): JSX.Element {
	return <DashboardWidgets />;
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
