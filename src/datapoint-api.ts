export type DatapointValueType = 'boolean' | 'number' | 'string' | 'json';

export interface DatapointListItem {
	id: string;
	name: string;
	type: DatapointValueType;
	value: boolean | number | string | null;
	unit?: string;
	role?: string;
	readable: boolean;
	writable: boolean;
	ts?: number;
	ack?: boolean;
}

export interface DatapointQuery {
	search?: string;
	types?: DatapointValueType[];
	offset?: number;
	limit?: number;
}

export interface DatapointListResponse {
	items: DatapointListItem[];
	total: number;
	offset: number;
	limit: number;
}

export interface DatapointAdapterApi {
	getForeignObjectsAsync(pattern: string, type: 'state'): Promise<Record<string, ioBroker.StateObject>>;
	getForeignStatesAsync(pattern: string): Promise<Record<string, ioBroker.State | null>>;
}

const STATE_REFRESH_INTERVAL_MS = 5_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Caches the read-only state-object index used by the development API. */
export class DatapointApi {
	private objects: Record<string, ioBroker.StateObject> | undefined;
	private states: Record<string, ioBroker.State | null> = {};
	private loadPromise: Promise<void> | undefined;
	private lastStateRefresh = 0;

	public constructor(private readonly adapter: DatapointAdapterApi) {}

	public async list(query: DatapointQuery = {}): Promise<DatapointListResponse> {
		await this.ensureLoaded();
		await this.refreshStatesIfNeeded();

		const search = query.search?.trim().toLocaleLowerCase() ?? '';
		const types = new Set(query.types ?? []);
		const items = Object.entries(this.objects ?? {})
			.map(([id, object]) => this.toListItem(id, object, this.states[id]))
			.filter((item): item is DatapointListItem => item !== undefined)
			.filter(
				item =>
					(!search ||
						item.id.toLocaleLowerCase().includes(search) ||
						item.name.toLocaleLowerCase().includes(search)) &&
					(types.size === 0 || types.has(item.type)),
			)
			.sort((left, right) => left.id.localeCompare(right.id));
		const offset = Math.max(0, Math.floor(query.offset ?? 0));
		const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)));

		return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
	}

	/**
	 * Allows a later subscription layer to keep the cached values current without new object reads.
	 *
	 * @param id
	 * @param state
	 */
	public updateState(id: string, state: ioBroker.State | null): void {
		this.states[id] = state;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.objects) {
			return;
		}
		this.loadPromise ??= this.load();
		await this.loadPromise;
	}

	private async load(): Promise<void> {
		const [objects, states] = await Promise.all([
			this.adapter.getForeignObjectsAsync('*', 'state'),
			this.adapter.getForeignStatesAsync('*'),
		]);
		this.objects = objects;
		this.states = states;
		this.lastStateRefresh = Date.now();
	}

	private async refreshStatesIfNeeded(): Promise<void> {
		if (Date.now() - this.lastStateRefresh < STATE_REFRESH_INTERVAL_MS) {
			return;
		}
		this.states = await this.adapter.getForeignStatesAsync('*');
		this.lastStateRefresh = Date.now();
	}

	private toListItem(
		id: string,
		object: ioBroker.StateObject,
		state: ioBroker.State | null | undefined,
	): DatapointListItem | undefined {
		const value = state?.val ?? null;
		const type = getValueType(object.common.type, value);
		if (!type) {
			return undefined;
		}
		return {
			id,
			name: getName(object.common.name, id),
			type,
			value,
			unit: object.common.unit,
			role: object.common.role,
			readable: object.common.read !== false,
			writable: object.common.write === true,
			ts: state?.ts,
			ack: state?.ack,
		};
	}
}

function getName(name: ioBroker.StringOrTranslated | undefined, fallback: string): string {
	if (typeof name === 'string') {
		return name;
	}
	return name?.en ?? name?.de ?? Object.values(name ?? {})[0] ?? fallback;
}

function getValueType(
	objectType: ioBroker.CommonType | undefined,
	value: boolean | number | string | null | undefined,
): DatapointValueType | undefined {
	if (objectType === 'boolean') {
		return 'boolean';
	}
	if (objectType === 'number') {
		return 'number';
	}
	if (objectType !== 'string') {
		return undefined;
	}
	return typeof value === 'string' && isJsonValue(value) ? 'json' : 'string';
}

function isJsonValue(value: string): boolean {
	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === 'object' && parsed !== null;
	} catch {
		return false;
	}
}
