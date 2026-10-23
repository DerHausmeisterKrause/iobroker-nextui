/** Versioned dashboard layout stored as one object per ioBroker adapter instance. */
export interface SavedWidget {
	id: string;
	title: string;
	datapointId: string;
	kind: 'number' | 'boolean' | 'text';
}

export interface DashboardDocument {
	revision: number;
	widgets: SavedWidget[];
}

export interface DashboardWrite {
	expectedRevision: number;
	widgets: SavedWidget[];
}

export interface DashboardPersistence {
	read(): Promise<unknown>;
	write(document: DashboardDocument): Promise<void>;
}

export class InvalidDashboardError extends Error {}
export class DashboardConflictError extends Error {}

const MAX_WIDGETS = 12;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 80;
const MAX_DP_LENGTH = 512;

/** Validate untrusted JSON, returning only explicitly supported properties. */
export function validateWidgets(value: unknown): SavedWidget[] {
	if (!Array.isArray(value) || value.length > MAX_WIDGETS) {
		throw new InvalidDashboardError('Invalid widget count.');
	}
	const ids = new Set<string>();
	return value.map((raw: unknown): SavedWidget => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			throw new InvalidDashboardError('Invalid widget.');
		}
		const w = raw as Record<string, unknown>;
		const text = (key: string, limit: number): string => {
			const v = w[key];
			if (
				typeof v !== 'string' ||
				v.length === 0 ||
				v.length > limit ||
				v.trim() !== v ||
				Array.from(v).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
			) {
				throw new InvalidDashboardError(`Invalid widget ${key}.`);
			}
			return v;
		};
		const id = text('id', MAX_ID_LENGTH);
		if (ids.has(id)) {
			throw new InvalidDashboardError('Duplicate widget id.');
		}
		ids.add(id);
		const title = text('title', MAX_TITLE_LENGTH);
		const datapointId = text('datapointId', MAX_DP_LENGTH);
		if (datapointId.includes('*')) {
			throw new InvalidDashboardError('Invalid datapoint id.');
		}
		if (w.kind !== 'number' && w.kind !== 'boolean' && w.kind !== 'text') {
			throw new InvalidDashboardError('Invalid widget kind.');
		}
		return { id, title, datapointId, kind: w.kind };
	});
}

export function validateDocument(raw: unknown): DashboardDocument {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new InvalidDashboardError('Corrupt stored dashboard.');
	}
	const data = raw as Record<string, unknown>;
	if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 0) {
		throw new InvalidDashboardError('Invalid dashboard revision.');
	}
	return { revision: data.revision as number, widgets: validateWidgets(data.widgets) };
}

/** Serializes writes and detects conflicting browser revisions. */
export class DashboardStore {
	private queue: Promise<void> = Promise.resolve();

	public constructor(private readonly persistence: DashboardPersistence) {}

	public async get(): Promise<DashboardDocument> {
		const saved = await this.persistence.read();
		return saved === undefined || saved === null ? { revision: 0, widgets: [] } : validateDocument(saved);
	}

	public async put(raw: unknown): Promise<DashboardDocument> {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			throw new InvalidDashboardError('Invalid dashboard payload.');
		}
		const data = raw as Record<string, unknown>;
		if (!Number.isSafeInteger(data.expectedRevision) || (data.expectedRevision as number) < 0) {
			throw new InvalidDashboardError('Invalid expectedRevision.');
		}
		const widgets = validateWidgets(data.widgets);
		const expectedRevision = data.expectedRevision as number;
		const operation = this.queue.then(async () => {
			const current = await this.get();
			if (current.revision !== expectedRevision) {
				throw new DashboardConflictError('Dashboard was modified by another browser.');
			}
			const next: DashboardDocument = { revision: current.revision + 1, widgets };
			await this.persistence.write(next);
			return next;
		});
		this.queue = operation.then(() => undefined, () => undefined);
		return operation;
	}
}
