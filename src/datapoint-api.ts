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
	getForeignStatesAsync(pattern: string[]): Promise<Record<string, ioBroker.State | null>>;
}

const STATE_CACHE_TTL_MS = 5_000;
const STATE_CACHE_MAX_ENTRIES = 500;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface CachedState {
	state: ioBroker.State | null;
	fetchedAt: number;
}

/** Read-only index with an explicit namespace allowlist and a bounded page-value cache. */
export class DatapointApi {
	private objects: Record<string, ioBroker.StateObject> | undefined;
	private objectLoadPromise: Promise<void> | undefined;
	private readonly states = new Map<string, CachedState>();
	private readonly stateRequests = new Map<string, Promise<void>>();

	public constructor(
		private readonly adapter: DatapointAdapterApi,
		private readonly allowedPatterns: readonly string[],
	) {}

	public async list(query: DatapointQuery = {}): Promise<DatapointListResponse> {
		await this.ensureObjectIndex();
		const offset = Math.max(0, Math.floor(query.offset ?? 0));
		const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)));
		const candidates = this.filterObjects(query);
		const page = candidates.slice(offset, offset + limit);
		await this.ensureStates(page.map(([id]) => id));

		return {
			items: page
				.map(([id, object]) => this.toListItem(id, object, this.states.get(id)?.state))
				.filter((item): item is DatapointListItem => item !== undefined),
			total: candidates.length,
			offset,
			limit,
		};
	}

	/** Accepts a future state subscription update without triggering a read. */
	public updateState(id: string, state: ioBroker.State | null): void {
		if (this.isAllowed(id)) {
			this.setCachedState(id, state);
		}
	}

	/** Invalidates the object index after a future object subscription notification. */
	public invalidateObjects(): void {
		this.objects = undefined;
		this.states.clear();
	}

	private async ensureObjectIndex(): Promise<void> {
		if (this.objects || this.allowedPatterns.length === 0) {
			this.objects ??= {};
			return;
		}
		this.objectLoadPromise ??= this.loadObjectIndex().finally(() => {
			this.objectLoadPromise = undefined;
		});
		await this.objectLoadPromise;
	}

	private async loadObjectIndex(): Promise<void> {
		const responses = await Promise.all(
			this.allowedPatterns.map(pattern => this.adapter.getForeignObjectsAsync(pattern, 'state')),
		);
		this.objects = Object.assign({}, ...responses);
	}

	private filterObjects(query: DatapointQuery): [string, ioBroker.StateObject][] {
		const search = query.search?.trim().toLocaleLowerCase() ?? '';
		const types = new Set(query.types ?? []);
		return Object.entries(this.objects ?? {})
			.filter(([id, object]) => this.isAllowed(id) && object.common.read !== false)
			.filter(([id, object]) => {
				const declaredType = getDeclaredType(object.common.type);
				return (
					declaredType !== undefined &&
					(!search ||
						id.toLocaleLowerCase().includes(search) ||
						getName(object.common.name, id).toLocaleLowerCase().includes(search)) &&
					(types.size === 0 ||
						(declaredType === 'string'
							? types.has('string') || types.has('json')
							: types.has(declaredType)))
				);
			})
			.sort(([left], [right]) => left.localeCompare(right));
	}

	private async ensureStates(ids: string[]): Promise<void> {
		const now = Date.now();
		const missingIds = ids.filter(id => {
			const cached = this.states.get(id);
			return !cached || now - cached.fetchedAt >= STATE_CACHE_TTL_MS;
		});
		if (missingIds.length === 0) {
			return;
		}
		const requestKey = [...missingIds].sort().join('\0');
		let request = this.stateRequests.get(requestKey);
		if (!request) {
			request = this.loadStates(missingIds).finally(() => this.stateRequests.delete(requestKey));
			this.stateRequests.set(requestKey, request);
		}
		await request;
	}

	private async loadStates(ids: string[]): Promise<void> {
		const states = await this.adapter.getForeignStatesAsync(ids);
		for (const id of ids) {
			this.setCachedState(id, states[id] ?? null);
		}
	}

	private setCachedState(id: string, state: ioBroker.State | null): void {
		this.states.delete(id);
		this.states.set(id, { state, fetchedAt: Date.now() });
		while (this.states.size > STATE_CACHE_MAX_ENTRIES) {
			const oldest = this.states.keys().next().value;
			if (!oldest) {
				break;
			}
			this.states.delete(oldest);
		}
	}

	private isAllowed(id: string): boolean {
		return this.allowedPatterns.some(pattern => matchesPattern(id, pattern));
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
			readable: true,
			writable: object.common.write === true,
			ts: state?.ts,
			ack: state?.ack,
		};
	}
}

export function parseAllowedPatterns(value: string | undefined): string[] {
	return [
		...new Set(
			(value ?? '')
				.split(/[\n,]/)
				.map(pattern => pattern.trim())
				.filter(Boolean),
		),
	];
}

function matchesPattern(id: string, pattern: string): boolean {
	const expression = new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*')}$`);
	return expression.test(id);
}

function getName(name: ioBroker.StringOrTranslated | undefined, fallback: string): string {
	if (typeof name === 'string') {
		return name;
	}
	return name?.en ?? name?.de ?? Object.values(name ?? {})[0] ?? fallback;
}

function getDeclaredType(objectType: ioBroker.CommonType | undefined): Exclude<DatapointValueType, 'json'> | undefined {
	return objectType === 'boolean' || objectType === 'number' || objectType === 'string' ? objectType : undefined;
}

function getValueType(
	objectType: ioBroker.CommonType | undefined,
	value: boolean | number | string | null,
): DatapointValueType | undefined {
	const declaredType = getDeclaredType(objectType);
	if (declaredType !== 'string') {
		return declaredType;
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
