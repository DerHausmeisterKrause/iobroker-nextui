import { expect } from 'chai';
import { DatapointLiveHub } from './datapoint-live-hub';

describe('DatapointLiveHub', () => {
	it('shares one subscription across browsers and unsubscribes on last disconnect', async () => {
		const subscribed: string[] = [];
		const unsubscribed: string[] = [];
		const api = {
			subscribeForeignStatesAsync: (id: string) => {
				subscribed.push(id);
				return Promise.resolve();
			},
			unsubscribeForeignStatesAsync: (id: string) => {
				unsubscribed.push(id);
				return Promise.resolve();
			},
		};
		const hub = new DatapointLiveHub(api);
		const first: string[] = [];
		const second: string[] = [];
		const disconnectFirst = await hub.subscribe(['safe.0.a', 'safe.0.a'], id => first.push(id));
		const disconnectSecond = await hub.subscribe(['safe.0.a', 'safe.0.b'], id => second.push(id));
		expect(subscribed).to.deep.equal(['safe.0.a', 'safe.0.b']);
		hub.publish('safe.0.a');
		expect(first).to.deep.equal(['safe.0.a']);
		expect(second).to.deep.equal(['safe.0.a']);
		await disconnectFirst();
		expect(unsubscribed).to.deep.equal([]);
		hub.publish('safe.0.a');
		expect(first).to.have.length(1);
		expect(second).to.have.length(2);
		await disconnectSecond();
		expect(unsubscribed).to.deep.equal(['safe.0.a', 'safe.0.b']);
		hub.publish('safe.0.a');
		expect(second).to.have.length(2);
	});

	it('rolls back on subscription failure and still accepts later subscriptions', async () => {
		const unsubscribed: string[] = [];
		let fail = true;
		const hub = new DatapointLiveHub({
			subscribeForeignStatesAsync: id =>
				id === 'safe.0.b' && fail ? Promise.reject(new Error('database unavailable')) : Promise.resolve(),
			unsubscribeForeignStatesAsync: id => {
				unsubscribed.push(id);
				return Promise.resolve();
			},
		});
		try {
			await hub.subscribe(['safe.0.a', 'safe.0.b'], () => undefined);
			throw new Error('Expected subscription failure');
		} catch (error) {
			expect((error as Error).message).to.equal('database unavailable');
		}
		expect(unsubscribed).to.deep.equal(['safe.0.a']);
		fail = false;
		const dispose = await hub.subscribe(['safe.0.b'], () => undefined);
		await dispose();
		await hub.close();
		expect(unsubscribed).to.deep.equal(['safe.0.a', 'safe.0.b']);
	});

	it('serializes concurrent clients and closes every subscription', async () => {
		const subscribed: string[] = [];
		const unsubscribed: string[] = [];
		const hub = new DatapointLiveHub({
			subscribeForeignStatesAsync: id => {
				subscribed.push(id);
				return Promise.resolve();
			},
			unsubscribeForeignStatesAsync: id => {
				unsubscribed.push(id);
				return Promise.resolve();
			},
		});
		const [first, second] = await Promise.all([
			hub.subscribe(['safe.0.a'], () => undefined),
			hub.subscribe(['safe.0.a'], () => undefined),
		]);
		expect(subscribed).to.deep.equal(['safe.0.a']);
		await hub.close();
		await Promise.all([first(), second()]);
		expect(unsubscribed).to.deep.equal(['safe.0.a']);
	});
});
