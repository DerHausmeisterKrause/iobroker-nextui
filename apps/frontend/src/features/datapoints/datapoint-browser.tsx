import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/card';

type DatapointType = 'boolean' | 'number' | 'string' | 'json';

interface Datapoint {
	id: string;
	name: string;
	type: DatapointType;
	value: boolean | number | string | null;
	unit?: string;
	role?: string;
	readable: boolean;
	writable: boolean;
	ts?: number;
	ack?: boolean;
}

interface DatapointResponse {
	items: Datapoint[];
	total: number;
}

const filters: { value: DatapointType; label: string }[] = [
	{ value: 'boolean', label: 'Boolean' },
	{ value: 'number', label: 'Zahl' },
	{ value: 'string', label: 'Text' },
	{ value: 'json', label: 'JSON' },
];

export function DatapointBrowser(): JSX.Element {
	const [search, setSearch] = useState('');
	const [types, setTypes] = useState<DatapointType[]>([]);
	const [result, setResult] = useState<DatapointResponse>();
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			void loadDatapoints(search, types, controller.signal)
				.then(setResult)
				.catch(loadError => {
					if ((loadError as Error).name !== 'AbortError') {
						setError((loadError as Error).message);
					}
				})
				.finally(() => {
					if (!controller.signal.aborted) {
						setLoading(false);
					}
				});
		}, 250);
		return () => {
			controller.abort();
			window.clearTimeout(timer);
		};
	}, [search, types]);

	const toggleType = (type: DatapointType): void => {
		setLoading(true);
		setError(undefined);
		setTypes(current => (current.includes(type) ? current.filter(value => value !== type) : [...current, type]));
	};

	return (
		<section className="space-y-6">
			<div>
				<p className="text-sm font-semibold text-sky-600 dark:text-sky-400">Lokaler Entwicklungsmodus</p>
				<h2 className="mt-1 text-3xl font-bold tracking-tight">Datenpunktbrowser</h2>
				<p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-300">
					Schreibgeschützte Ansicht der über die Adapter-API bereitgestellten ioBroker-Datenpunkte.
				</p>
			</div>
			<Card className="space-y-4 hover:translate-y-0 hover:shadow-sm">
				<label className="relative block">
					<span className="sr-only">Datenpunkte suchen</span>
					<Search
						className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
						size={19}
					/>
					<input
						className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-slate-700 dark:bg-slate-950"
						placeholder="Nach ID oder Name suchen"
						value={search}
						onChange={event => {
							setLoading(true);
							setError(undefined);
							setSearch(event.target.value);
						}}
					/>
				</label>
				<div
					className="flex flex-wrap gap-2"
					aria-label="Datentypen filtern"
				>
					{filters.map(filter => (
						<button
							key={filter.value}
							type="button"
							className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition ${types.includes(filter.value) ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 hover:border-sky-400 dark:border-slate-700'}`}
							onClick={() => toggleType(filter.value)}
						>
							{filter.label}
						</button>
					))}
				</div>
			</Card>
			{loading && (
				<p
					role="status"
					className="text-sm text-slate-500"
				>
					Datenpunkte werden geladen …
				</p>
			)}
			{error && (
				<p
					role="alert"
					className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
				>
					{error}
				</p>
			)}
			{!loading && !error && result?.items.length === 0 && (
				<p className="text-sm text-slate-500">Keine Datenpunkte gefunden.</p>
			)}
			{!loading && !error && result && result.items.length > 0 && (
				<div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
					<div className="hidden grid-cols-[minmax(12rem,2fr)_minmax(10rem,1fr)_auto_auto] gap-4 bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-900 sm:grid">
						<span>Datenpunkt</span>
						<span>Wert</span>
						<span>Änderung</span>
						<span>Zugriff</span>
					</div>
					<ul className="divide-y divide-slate-200 dark:divide-slate-800">
						{result.items.map(item => (
							<DatapointRow
								key={item.id}
								item={item}
							/>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function DatapointRow({ item }: { item: Datapoint }): JSX.Element {
	return (
		<li className="grid gap-2 bg-white px-4 py-4 text-sm dark:bg-slate-950 sm:grid-cols-[minmax(12rem,2fr)_minmax(10rem,1fr)_auto_auto] sm:items-center sm:gap-4">
			<div className="min-w-0">
				<p className="font-semibold">{item.name}</p>
				<p className="truncate font-mono text-xs text-slate-500">{item.id}</p>
			</div>
			<div>
				<span className="font-medium">{formatValue(item.value)}</span>
				{item.unit && <span className="ml-1 text-slate-500">{item.unit}</span>}
				<span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800">
					{item.type}
				</span>
			</div>
			<span className="text-xs text-slate-500">{item.ts ? new Date(item.ts).toLocaleString() : '–'}</span>
			<span
				className={
					item.writable ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
				}
			>
				{item.writable ? 'Lesen/Schreiben' : 'Nur lesen'}
			</span>
		</li>
	);
}

function formatValue(value: Datapoint['value']): string {
	return value === null ? 'null' : String(value);
}

async function loadDatapoints(search: string, types: DatapointType[], signal: AbortSignal): Promise<DatapointResponse> {
	const params = new URLSearchParams({ limit: '50' });
	if (search.trim()) {
		params.set('search', search.trim());
	}
	if (types.length) {
		params.set('types', types.join(','));
	}
	const response = await fetch(`/api/datapoints?${params}`, { signal });
	if (!response.ok) {
		throw new Error(
			response.status === 403
				? 'Der Datenpunkt-Entwicklungsmodus ist nicht aktiviert.'
				: 'Datenpunkte konnten nicht geladen werden.',
		);
	}
	return response.json() as Promise<DatapointResponse>;
}
