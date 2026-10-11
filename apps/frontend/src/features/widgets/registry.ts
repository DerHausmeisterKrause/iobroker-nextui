export interface WidgetDefinition {
	id: string;
	name: string;
	description: string;
}

export class WidgetRegistry {
	private readonly definitions = new Map<string, WidgetDefinition>();

	public register(definition: WidgetDefinition): void {
		this.definitions.set(definition.id, definition);
	}

	public list(): WidgetDefinition[] {
		return [...this.definitions.values()];
	}
}

export const widgetRegistry = new WidgetRegistry();
