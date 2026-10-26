import { useState, type DragEvent, type ReactNode } from 'react';
import { GripVertical, MoveDown, MoveUp, Pencil, X } from 'lucide-react';
import type { DashboardWidgetConfig } from './dashboard-widgets';
import { widgetRegistry, type WidgetKind } from './registry';

export function reorderWidgets(widgets: DashboardWidgetConfig[], fromId: string, toId: string): DashboardWidgetConfig[] {
	const from = widgets.findIndex(widget => widget.id === fromId);
	const to = widgets.findIndex(widget => widget.id === toId);
	if (from < 0 || to < 0 || from === to) {
		return widgets;
	}
	const reordered = [...widgets];
	const [moved] = reordered.splice(from, 1);
	reordered.splice(to, 0, moved);
	return reordered;
}

export function updateWidget(
	widgets: DashboardWidgetConfig[],
	id: string,
	patch: Pick<DashboardWidgetConfig, 'title' | 'datapointId' | 'kind' | 'span'>,
): DashboardWidgetConfig[] {
	return widgets.map(widget => widget.id === id ? { ...widget, ...patch } : widget);
}

const widthClasses: Record<1 | 2 | 3, string> = {
	1: 'min-w-0',
	2: 'min-w-0 sm:col-span-2',
	3: 'min-w-0 sm:col-span-2 xl:col-span-3',
};

export function WidgetLayout({
	widgets,
	editing,
	disabled,
	onChange,
	renderWidget,
}: {
	widgets: DashboardWidgetConfig[];
	editing: boolean;
	disabled: boolean;
	onChange: (widgets: DashboardWidgetConfig[]) => void;
	renderWidget: (widget: DashboardWidgetConfig) => ReactNode;
}): JSX.Element {
	const [selectedId, setSelectedId] = useState<string>();
	const [draft, setDraft] = useState<DashboardWidgetConfig>();
	const [draggedId, setDraggedId] = useState<string>();
	const selected = widgets.find(widget => widget.id === selectedId);

	const choose = (widget: DashboardWidgetConfig): void => {
		setSelectedId(widget.id);
		setDraft({ ...widget });
	};

	const onDragStart = (event: DragEvent<HTMLButtonElement>, id: string): void => {
		setDraggedId(id);
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', id);
	};

	const onDrop = (event: DragEvent<HTMLDivElement>, targetId: string): void => {
		event.preventDefault();
		const sourceId = draggedId ?? event.dataTransfer.getData('text/plain');
		setDraggedId(undefined);
		if (!disabled && sourceId) {
			onChange(reorderWidgets(widgets, sourceId, targetId));
		}
	};

	return (
		<div className="space-y-5">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{widgets.map((widget, index) => (
					<div
						key={widget.id}
						className={widthClasses[widget.span ?? 1]}
						onDragOver={editing ? event => event.preventDefault() : undefined}
						onDrop={editing ? event => onDrop(event, widget.id) : undefined}
					>
						{editing && (
							<div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-sky-400 p-2 text-xs">
								<button
									type="button"
									draggable={!disabled}
									onDragStart={event => onDragStart(event, widget.id)}
									onDragEnd={() => setDraggedId(undefined)}
									disabled={disabled}
									aria-label={`Kachel ${widget.title} ziehen`}
									title="Zum Verschieben ziehen"
									className="rounded p-1 hover:bg-sky-100 dark:hover:bg-sky-950"
								><GripVertical size={17} /></button>
								<button
									type="button"
									disabled={disabled || index === 0}
									onClick={() => onChange(reorderWidgets(widgets, widget.id, widgets[index - 1].id))}
									aria-label={`Kachel ${widget.title} nach oben`}
									className="rounded p-1 disabled:opacity-30"
								><MoveUp size={17} /></button>
								<button
									type="button"
									disabled={disabled || index === widgets.length - 1}
									onClick={() => onChange(reorderWidgets(widgets, widget.id, widgets[index + 1].id))}
									aria-label={`Kachel ${widget.title} nach unten`}
									className="rounded p-1 disabled:opacity-30"
								><MoveDown size={17} /></button>
								<button
									type="button"
									disabled={disabled}
									onClick={() => choose(widget)}
									aria-label={`Kachel ${widget.title} bearbeiten`}
									className="ml-auto flex items-center gap-1 rounded px-2 py-1 font-semibold hover:bg-sky-100 dark:hover:bg-sky-950"
								><Pencil size={15} /> Bearbeiten</button>
							</div>
						)}
						{renderWidget(widget)}
					</div>
				))}
			</div>
			{editing && selected && draft && (
				<form
					className="space-y-4 rounded-2xl border border-sky-300 p-5 dark:border-sky-800"
					onSubmit={event => {
						event.preventDefault();
						if (!disabled && draft.title.trim() && draft.datapointId.trim()) {
							onChange(updateWidget(widgets, selected.id, {
								title: draft.title.trim(),
								datapointId: draft.datapointId.trim(),
								kind: draft.kind,
								span: draft.span ?? 1,
							}));
							setSelectedId(undefined);
							setDraft(undefined);
						}
					}}
				>
					<div className="flex items-center justify-between gap-3">
						<h3 className="font-semibold">Kachel bearbeiten</h3>
						<button type="button" onClick={() => { setSelectedId(undefined); setDraft(undefined); }} aria-label="Editor schließen"><X size={19} /></button>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="text-sm font-semibold">Titel
							<input
								required
								maxLength={80}
								value={draft.title}
								onChange={event => setDraft({ ...draft, title: event.target.value })}
								className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
							/>
						</label>
						<label className="text-sm font-semibold">Darstellung
							<select
								value={draft.kind}
								onChange={event => setDraft({ ...draft, kind: event.target.value as WidgetKind })}
								className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
							>
								{widgetRegistry.list().map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
							</select>
						</label>
						<label className="text-sm font-semibold">Datenpunkt-ID
							<input
								required
								maxLength={512}
								value={draft.datapointId}
								onChange={event => setDraft({ ...draft, datapointId: event.target.value })}
								className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
							/>
						</label>
						<label className="text-sm font-semibold">Kachelbreite
							<select
								value={draft.span ?? 1}
								onChange={event => setDraft({ ...draft, span: Number(event.target.value) as 1 | 2 | 3 })}
								className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950"
							>
								<option value="1">Schmal (1 Spalte)</option>
								<option value="2">Mittel (2 Spalten)</option>
								<option value="3">Breit (ganze Reihe)</option>
							</select>
						</label>
					</div>
					<p className="text-xs text-slate-500">Die neue Datenpunkt-ID muss in der NextUI-Allowlist freigegeben und lesbar sein.</p>
					<button
						type="submit"
						disabled={disabled || !draft.title.trim() || !draft.datapointId.trim()}
						className="min-h-11 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white disabled:opacity-50"
					>Kacheländerungen speichern</button>
				</form>
			)}
		</div>
	);
}
