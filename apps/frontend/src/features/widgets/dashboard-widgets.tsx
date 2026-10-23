import { Activity, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../../components/ui/card';
import { type WidgetKind, widgetRegistry } from './registry';

export interface DashboardWidgetConfig {
	id: string;
	title: string;
	datapointId: string;
	kind: WidgetKind;
}

interface Datapoint {
	id: string;
	name: string;
	type: 'boolean' | 'number' | 'string' | 'json';
	value: boolean | number | string | null;
	unit?: string;
	ts?: number;
	ack?: boolean;
}

interface SearchResponse {
	items: Datapoint[];
	total: number;
}

const STORAGE_KEY = 'nextui-readonly-widgets-v1';
const MAX_WIDGETS = 12;
const REFRESH_INTERVAL_MS = 10_000;

export function parseStoredWidgets(raw: string | null): DashboardWidgetConfig[] {
	if (!raw) {
		return [];
	}
	try {
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value)) {
			return [];
		}
		return value
			.filter((widget): widget is DashboardWidgetConfig => {
				if (!widget || typeof widget !== 'object') {
					return false;
				}
				const item = widget as Partial<DashboardWidgetConfig>;
				return (
					typeof item.id === 'string' &&
					item.id.length > 0 &&
					typeof item.title === 'string' &&
					item.title.length <= 80 &&
					typeof item.datapointId === 'string' &&
					item.datapointId.length > 0 &&
					item.datapointId.length <= 512 &&
					widgetRegistry.list().some(definition => definition.id === item.kind)
				);
			})
			.slice(0, MAX_WIDGETS);
	} catch {
		return [];
	}
}

function readSavedWidgets(): DashboardWidgetConfig[] {
	try {
		return parseStoredWidgets(window.localStorage.getItem(STORAGE_KEY));
	} catch {
		return [];
	}
}

export function DashboardWidgets(): JSX.Element {
	const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(readSavedWidgets);
	const [storageError, setStorageError] = useState(false);

	useEffect(() => {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
			setStorageError(false);
		} catch {
			setStorageError(true);
		}
	}, [widgets]);

	const addWidget = (datapoint: Datapoint, kind: WidgetKind, title: string): void => {
		setWidgets(current =>
			current.length >= MAX_WIDGETS
				? current
				: [
						...current,
						{
							id: `widget-${Date.now()}-${Math.random().toString(36).slice(2)}`,
							datapointId: datapoint.id,
							kind,
							title: (title.trim() || datapoint.name).slice(0, 80),
						},
					],
		);
	};

	return (
		<section className="space-y-7">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-sm font-semibold text-sky-600 dark:text-sky-400">NextUI · Frühe Vorschau</p>
					<h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Mein Dashboard</h2>
					<p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-300">
						Verbinde deine ersten Kacheln mit echten ioBroker-Datenpunkten. Die Anzeige ist noch schreibgeschützt.
					</p>
				</div>
			</div>

			<Card className="space-y-3 hover:translate-y-0">
				<div className="flex items-center gap-2">
					<Plus className="text-sky-600" size={19} />
					<h3 className="font-bold">Kachel hinzufügen</h3>
				</div>
				<WidgetConfigurator onAdd={addWidget} disabled={widgets.length >= MAX_WIDGETS} />
			</Card>
			{storageError && (
				<p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
					Die Kacheleinstellungen konnten nicht im Browser gespeichert werden.
				</p>
			)}
			<p className="text-xs text-slate-500">
				{widgets.length} von {MAX_WIDGETS} Kacheln · Konfiguration nur in diesem Browser gespeichert · Aktualisierung alle 10 Sekunden
			</p>
			{widgets.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
					<Activity className="mx-auto mb-3 text-sky-500" size={26} />
					<p className="font-semibold">Noch keine Kacheln angelegt</p>
					<p className="mt-2 text-sm text-slate-500">
						Suche oben einen freigegebenen Datenpunkt und wähle die Darstellung selbst aus.
					</p>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{widgets.map(widget => (
						<DatapointWidget
							key={widget.id}
							config={widget}
							onRemove={() => setWidgets(current => current.filter(item => item.id !== widget.id))}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function WidgetConfigurator({
	onAdd,
	disabled,
}: {
	onAdd: (datapoint: Datapoint, kind: WidgetKind, title: string) => void;
	disabled: boolean;
}): JSX.Element {
	const [search, setSearch] = useState('');
	const [items, setItems] = useState<Datapoint[]>([]);
	const [selected, setSelected] = useState<Datapoint>();
	const [kind, setKind] = useState<WidgetKind>('number');
	const [title, setTitle] = useState('');
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			setLoading(true);
			const params = new URLSearchParams({ limit: '20', search: search.trim() });
			void fetch(`/api/datapoints?${params}`, { signal: controller.signal })
				.then(async response => {
					if (!response.ok) {
						throw new Error(
							response.status === 403
								? 'Datenpunkt-API deaktiviert. Aktiviere den lokalen Entwicklungsmodus mit Allowlist und nutze den SSH-Tunnel.'
								: 'Datenpunkte konnten nicht geladen werden.',
						);
					}
					return (await response.json()) as SearchResponse;
				})
				.then(result => {
					if (!controller.signal.aborted) {
						setItems(result.items);
						setError(undefined);
					}
				})
				.catch(reason => {
					if (!controller.signal.aborted) {
						setItems([]);
						setError((reason as Error).message);
					}
				})
				.finally(() => {
					if (!controller.signal.aborted) {
						setLoading(false);
					}
				});
		}, 300);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [search]);

	return (
		<div className="space-y-4">
			<label className="block text-sm font-semibold">
				Datenpunkt suchen (ID oder Name)
				<input
					type="search"
					value={search}
					onChange={event => {
						setSearch(event.target.value);
						setSelected(undefined);
					}}
					placeholder="z. B. 0_userdata.0.NextUITest.temperatur"
					className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950"
				/>
			</label>
			{loading && <p role="status" className="text-sm text-slate-500">Datenpunkte suchen …</p>}
			{error && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{error}</p>}
			{!error && !loading && items.length > 0 && (
				<div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1 dark:border-slate-700" aria-label="Datenpunkt auswählen">
					{items.map(item => (
						<button
							type="button"
							key={item.id}
							onClick={() => setSelected(item)}
							className={`block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${selected?.id === item.id ? 'bg-sky-50 dark:bg-sky-950' : ''}`}
						>
							<span className="block font-semibold">{item.name} ({item.type})</span>
							<span className="block break-all font-mono text-slate-500">{item.id}</span>
						</button>
					))}
				</div>
			)}
			{selected && (
				<p className="break-all text-xs text-sky-700 dark:text-sky-300">Ausgewählt: {selected.id}</p>
			)}
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="text-sm font-semibold">
					Darstellung
					<select
						value={kind}
						onChange={event => setKind(event.target.value as WidgetKind)}
						className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
					>
						{widgetRegistry.list().map(definition => (
							<option key={definition.id} value={definition.id}>{definition.name}</option>
						))}
					</select>
				</label>
				<label className="text-sm font-semibold">
					Titel (optional)
					<input
						type="text"
						maxLength={80}
						value={title}
						onChange={event => setTitle(event.target.value)}
						placeholder={selected?.name ?? 'Mein Widget'}
						className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
					/>
				</label>
			</div>
			<button
				type="button"
				disabled={!selected || disabled}
				onClick={() => {
					if (!selected) {
						return;
					}
					onAdd(selected, kind, title);
					setSelected(undefined);
					setTitle('');
				}}
				className="min-h-11 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{disabled ? 'Maximale Anzahl erreicht' : 'Kachel hinzufügen'}
			</button>
		</div>
	);
}

function DatapointWidget({ config, onRemove }: { config: DashboardWidgetConfig; onRemove: () => void }): JSX.Element {
	const [item, setItem] = useState<Datapoint>();
	const [error, setError] = useState<string>();
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let activeController: AbortController | undefined;
		const refresh = (): void => {
			activeController?.abort();
			const controller = new AbortController();
			activeController = controller;
			void fetch(`/api/datapoints/by-id?id=${encodeURIComponent(config.datapointId)}`, { signal: controller.signal })
				.then(async response => {
					if (!response.ok) {
						throw new Error(
							response.status === 403
								? 'Lokale Datenpunkt-API deaktiviert'
								: 'Datenpunkt nicht verfügbar oder nicht freigegeben',
						);
					}
					return (await response.json()) as { item: Datapoint };
				})
				.then(result => {
					if (!controller.signal.aborted) {
						setItem(result.item);
						setError(undefined);
					}
				})
				.catch(reason => {
					if (!controller.signal.aborted) {
						setItem(undefined);
						setError((reason as Error).message);
					}
				})
				.finally(() => {
					if (!controller.signal.aborted) {
						setLoading(false);
					}
				});
		};
		refresh();
		const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
		return () => {
			window.clearInterval(timer);
			activeController?.abort();
		};
	}, [config.datapointId]);

	return (
		<Card className="min-w-0 hover:translate-y-0" role="group" aria-label={config.title}>
			<div className="flex items-start justify-between gap-3">
				<h3 className="min-w-0 break-words font-bold">{config.title}</h3>
				<div className="flex items-center gap-2">
					<RefreshCw size={15} className="text-slate-400" aria-hidden="true" />
					<button
						type="button"
						onClick={onRemove}
						aria-label={`Kachel ${config.title} entfernen`}
						className="rounded-md p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
					>
						<Trash2 size={17} />
					</button>
				</div>
			</div>
			<p className="mt-1 truncate font-mono text-xs text-slate-500" title={config.datapointId}>{config.datapointId}</p>
			{loading ? (
				<p role="status" className="mt-6 text-sm text-slate-500">Wert wird geladen …</p>
			) : error ? (
				<p role="alert" className="mt-6 text-sm text-amber-700 dark:text-amber-300">{error}</p>
			) : (
				<div className="mt-6">
					<p className="break-words text-3xl font-bold tracking-tight">{formatWidgetValue(config.kind, item)}</p>
					{item?.ts && <p className="mt-2 text-xs text-slate-500">Stand: {new Date(item.ts).toLocaleString('de-DE')}</p>}
				</div>
			)}
		</Card>
	);
}

export function formatWidgetValue(kind: WidgetKind, item: Datapoint | undefined): string {
	if (!item || item.value === null) {
		return '–';
	}
	if (kind === 'number') {
		return typeof item.value === 'number'
			? `${item.value.toLocaleString('de-DE', { maximumFractionDigits: 2 })}${item.unit ? ` ${item.unit}` : ''}`
			: 'Datentyp passt nicht';
	}
	if (kind === 'boolean') {
		return typeof item.value === 'boolean' ? (item.value ? 'Ein' : 'Aus') : 'Datentyp passt nicht';
	}
	return typeof item.value === 'string' ? item.value.slice(0, 200) : 'Datentyp passt nicht';
}
