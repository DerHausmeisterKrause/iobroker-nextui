import { expect } from 'chai';
import { DatapointApi, parseAllowedPatterns } from './datapoint-api';

describe('DatapointApi', () => {
	it('does not query or expose anything without explicit allowed patterns', async () => {
		let objectRequests = 0;
		const api = new DatapointApi(
			{
				getForeignObjectsAsync: () => {
					objectRequests++;
					return Promise.resolve(objects());
				},
				getForeignStatesAsync: () => Promise.resolve(states()),
			},
			[],
		);
		expect(await api.list()).to.deep.include({ total: 0, items: [] });
		expect(objectRequests).to.equal(0);
	});

	it('excludes non-readable and non-allowlisted datapoints before reading their values', async () => {
		const requestedStates: string[][] = [];
		const api = new DatapointApi(
			{
				getForeignObjectsAsync: () => Promise.resolve(objects()),
				getForeignStatesAsync: ids => {
					requestedStates.push(ids);
					return Promise.resolve(states());
				},
			},
			['safe.0.*'],
		);

		const result = await api.list({ limit: 10 });
		expect(result.items.map(item => item.id)).to.deep.equal(['safe.0.label', 'safe.0.temperature']);
		expect(requestedStates).to.deep.equal([['safe.0.label', 'safe.0.temperature']]);
	});

	it('fetches only the requested page, caches it and coalesces parallel requests', async () => {
		let stateRequests = 0;
		const api = new DatapointApi(
			{
				getForeignObjectsAsync: () => Promise.resolve(objects()),
				getForeignStatesAsync: ids => {
					stateRequests++;
					return Promise.resolve(pickStates(ids));
				},
			},
			['safe.0.*'],
		);

		const [first, second] = await Promise.all([api.list({ limit: 1 }), api.list({ limit: 1 })]);
		expect(first.items[0].id).to.equal('safe.0.label');
		expect(second.items[0].id).to.equal('safe.0.label');
		expect(stateRequests).to.equal(1);
		await api.list({ offset: 1, limit: 1 });
		expect(stateRequests).to.equal(2);
		await api.list({ offset: 1, limit: 1 });
		expect(stateRequests).to.equal(2);
	});

	it('propagates state read errors and allows a later request to retry', async () => {
		let fail = true;
		const api = new DatapointApi(
			{
				getForeignObjectsAsync: () => Promise.resolve(objects()),
				getForeignStatesAsync: ids => {
					if (fail) {
						fail = false;
						return Promise.reject(new Error('state database unavailable'));
					}
					return Promise.resolve(pickStates(ids));
				},
			},
			['safe.0.*'],
		);
		try {
			await api.list({ limit: 1 });
			throw new Error('The first state request unexpectedly succeeded');
		} catch (error) {
			expect((error as Error).message).to.equal('state database unavailable');
		}
		expect((await api.list({ limit: 1 })).items).to.have.length(1);
	});

	it('reloads object metadata when invalidated for future object changes', async () => {
		let objectRequests = 0;
		const api = new DatapointApi(
			{
				getForeignObjectsAsync: () => {
					objectRequests++;
					return Promise.resolve(objects());
				},
				getForeignStatesAsync: ids => Promise.resolve(pickStates(ids)),
			},
			['safe.0.*'],
		);
		await api.list();
		api.invalidateObjects();
		await api.list();
		expect(objectRequests).to.equal(2);
	});

	it('fetches only an exact, readable and explicitly allowlisted datapoint for widgets', async () => {
		const requestedStates: string[][] = [];
		const api = new DatapointApi(
			{
				getForeignObjectsAsync: () => Promise.resolve(objects()),
				getForeignStatesAsync: ids => {
					requestedStates.push(ids);
					return Promise.resolve(pickStates(ids));
				},
			},
			['safe.0.*'],
		);
		expect((await api.get('safe.0.temperature'))?.value).to.equal(21.5);
		expect(await api.get('safe.0.private')).to.equal(undefined);
		expect(await api.get('other.0.secret')).to.equal(undefined);
		expect(await api.get('safe.0.unknown')).to.equal(undefined);
		expect(requestedStates).to.deep.equal([['safe.0.temperature']]);
	});

	it('parses comma and line separated allowlist entries', () => {
		expect(parseAllowedPatterns('safe.0.*,\nsafe.1.*\n safe.0.* ')).to.deep.equal(['safe.0.*', 'safe.1.*']);
	});
});

function objects(): Record<string, ioBroker.StateObject> {
	return {
		'safe.0.temperature': stateObject('number', 'Temperature'),
		'safe.0.label': stateObject('string', 'Label'),
		'safe.0.private': stateObject('string', 'Private', { read: false }),
		'other.0.secret': stateObject('string', 'Secret'),
	};
}

function states(): Record<string, ioBroker.State> {
	return {
		'safe.0.temperature': state(21.5),
		'safe.0.label': state('Kitchen'),
		'safe.0.private': state('not-for-the-api'),
		'other.0.secret': state('also-not-for-the-api'),
	};
}

function pickStates(ids: string[]): Record<string, ioBroker.State> {
	const all = states();
	return Object.fromEntries(ids.flatMap(id => (all[id] ? [[id, all[id]]] : [])));
}

function stateObject(
	type: ioBroker.CommonType,
	name: string,
	extra: Partial<ioBroker.StateCommon> = {},
): ioBroker.StateObject {
	return {
		_id: '',
		type: 'state',
		common: { name, type, role: 'value', read: true, write: false, ...extra },
		native: {},
	};
}

function state(val: boolean | number | string): ioBroker.State {
	return { val, ts: 123, ack: true, lc: 123, from: 'system.adapter.test.0' };
}
