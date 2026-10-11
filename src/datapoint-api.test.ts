import { expect } from 'chai';
import { DatapointApi } from './datapoint-api';

describe('DatapointApi', () => {
	it('filters, paginates and caches state-object queries', async () => {
		let objectRequests = 0;
		let stateRequests = 0;
		const api = new DatapointApi({
			getForeignObjectsAsync: () => {
				objectRequests++;
				return Promise.resolve(objects());
			},
			getForeignStatesAsync: () => {
				stateRequests++;
				return Promise.resolve(states());
			},
		});

		const result = await api.list({ search: 'temperature', types: ['number'], offset: 0, limit: 1 });
		expect(result).to.deep.include({ total: 2, offset: 0, limit: 1 });
		expect(result.items[0]).to.deep.include({ id: 'test.0.targetTemperature', type: 'number', writable: false });
		const nextPage = await api.list({ search: 'temperature', types: ['number'], offset: 1, limit: 1 });
		expect(nextPage.items[0]).to.deep.include({ id: 'test.0.temperature', unit: '°C' });
		expect(objectRequests).to.equal(1);
		expect(stateRequests).to.equal(1);
	});

	it('returns boolean, strings and JSON-encoded strings with safe metadata only', async () => {
		const api = new DatapointApi({
			getForeignObjectsAsync: () => Promise.resolve(objects()),
			getForeignStatesAsync: () => Promise.resolve(states()),
		});
		const result = await api.list({ limit: 10 });
		expect(result.items.map(item => item.type)).to.have.members(['boolean', 'number', 'number', 'string', 'json']);
		expect(result.items.find(item => item.id === 'test.0.settings')).to.deep.include({
			type: 'json',
			name: 'Settings',
			ack: true,
			readable: true,
			writable: true,
		});
	});
});

function objects(): Record<string, ioBroker.StateObject> {
	return {
		'test.0.temperature': stateObject('number', 'Temperature', { unit: '°C' }),
		'test.0.targetTemperature': stateObject('number', 'Target temperature'),
		'test.0.enabled': stateObject('boolean', 'Enabled'),
		'test.0.label': stateObject('string', 'Label'),
		'test.0.settings': stateObject('string', 'Settings', { write: true }),
	};
}

function states(): Record<string, ioBroker.State> {
	return {
		'test.0.temperature': state(21.5, 123, true),
		'test.0.targetTemperature': state(22, 124, false),
		'test.0.enabled': state(true, 125, true),
		'test.0.label': state('Kitchen', 126, true),
		'test.0.settings': state('{"mode":"eco"}', 127, true),
	};
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

function state(val: boolean | number | string, ts: number, ack: boolean): ioBroker.State {
	return { val, ts, ack, lc: ts, from: 'system.adapter.test.0' };
}
