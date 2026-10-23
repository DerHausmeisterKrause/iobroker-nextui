import { expect } from 'chai';
import {
	DashboardConflictError,
	DashboardStore,
	InvalidDashboardError,
	validateDocument,
	validateWidgets,
	type DashboardDocument,
} from './dashboard-store';

const initialWidgets = [{ id: 'w-1', title: 'Temperatur', kind: 'number', datapointId: 'safe.0.temperature' }] as const;

function createStore(): { store: DashboardStore; readSaved: () => DashboardDocument | undefined } {
	let saved: DashboardDocument | undefined;
	return {
		store: new DashboardStore({
			read: () => Promise.resolve(saved),
			write: document => {
				saved = structuredClone(document);
				return Promise.resolve();
			},
		}),
		readSaved: () => saved,
	};
}

describe('DashboardStore', () => {
	it('starts empty and persists versioned widgets across store recreations', async () => {
		const database = createStore();
		expect(await database.store.get()).to.deep.equal({ revision: 0, widgets: [] });
		const first = await database.store.put({ expectedRevision: 0, widgets: initialWidgets });
		expect(first.revision).to.equal(1);
		expect(database.readSaved()).to.deep.equal(first);
		expect(await database.store.get()).to.deep.equal(first);
	});

	it('rejects stale browser updates and concurrent writes', async () => {
		const { store } = createStore();
		const result = await Promise.allSettled([
			store.put({ expectedRevision: 0, widgets: initialWidgets }),
			store.put({ expectedRevision: 0, widgets: [] }),
		]);
		expect(result.filter(item => item.status === 'fulfilled')).to.have.length(1);
		const rejected = result.find(item => item.status === 'rejected');
		expect(rejected).to.have.property('reason').that.is.instanceOf(DashboardConflictError);
		expect((await store.get()).revision).to.equal(1);
	});

	it('rejects malformed widgets and strips untrusted properties', async () => {
		const { store } = createStore();
		for (const widgets of [
			[{ ...initialWidgets[0], id: 'wrong\nname' }],
			[{ ...initialWidgets[0], kind: 'javascript' }],
			[{ ...initialWidgets[0], datapointId: 'safe.0.*' }],
			[initialWidgets[0], initialWidgets[0]],
			Array.from({ length: 13 }, (_, i) => ({ ...initialWidgets[0], id: String(i) })),
		]) {
			try {
				await store.put({ expectedRevision: 0, widgets });
				throw new Error('Rejected input unexpectedly saved');
			} catch (error) {
				expect(error).to.be.instanceOf(InvalidDashboardError);
			}
		}
		const result = validateWidgets([{ ...initialWidgets[0], accessToken: 'do-not-store', value: 'secret' }]);
		expect(result).to.deep.equal([...initialWidgets]);
		expect(() => validateDocument({ revision: -1, widgets: [] })).to.throw(InvalidDashboardError);
	});

	it('retries when a database write fails without advancing revision', async () => {
		let saved: DashboardDocument | undefined;
		let fail = true;
		const store = new DashboardStore({
			read: () => Promise.resolve(saved),
			write: data => {
				if (fail) {
					fail = false;
					return Promise.reject(new Error('Object DB offline'));
				}
				saved = data;
				return Promise.resolve();
			},
		});
		try {
			await store.put({ expectedRevision: 0, widgets: [] });
			throw new Error('Write unexpectedly succeeded');
		} catch (error) {
			expect((error as Error).message).to.equal('Object DB offline');
		}
		expect((await store.put({ expectedRevision: 0, widgets: [] })).revision).to.equal(1);
	});
});
