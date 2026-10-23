export type WidgetKind = 'number' | 'boolean' | 'text';

export interface WidgetDefinition {
	id: WidgetKind;
	name: string;
	description: string;
}

export class WidgetRegistry {
	private readonly definitions = new Map<WidgetKind, WidgetDefinition>();

	public register(definition: WidgetDefinition): void {
		this.definitions.set(definition.id, definition);
	}

	public list(): WidgetDefinition[] {
		return [...this.definitions.values()];
	}
}

export const widgetRegistry = new WidgetRegistry();

widgetRegistry.register({ id: 'number', name: 'Zahlenwert', description: 'Numerischer Wert mit Einheit' });
widgetRegistry.register({ id: 'boolean', name: 'Status', description: 'Ein-/Aus-Anzeige für Boolean-Datenpunkte' });
widgetRegistry.register({ id: 'text', name: 'Textwert', description: 'Textanzeige für String-Datenpunkte' });
