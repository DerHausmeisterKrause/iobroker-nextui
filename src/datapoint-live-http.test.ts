import { get as httpGet, type IncomingMessage, type ClientRequest } from 'node:http';
import { expect } from 'chai';
import { NextuiWebServer } from './web-server';
import { HttpAuthenticator } from './http-auth';
import type { DatapointListItem } from './datapoint-api';

function fetchStream(port: number, path: string, authorization?: string): Promise<{
	status?: number;
	res: IncomingMessage;
	request: ClientRequest;
	readEvent: (expected: string) => Promise<string>;
}> {
	return new Promise((resolve, reject) => {
		const request = httpGet(
			{ hostname: '127.0.0.1', port, path, headers: authorization ? { authorization } : {} },
			res => {
				let buffer = '';
				let resolver: ((value: string) => void) | undefined;
				res.on('data', (chunk: Buffer) => {
					buffer += chunk.toString('utf8');
					if (resolver && buffer.includes('\\n\\n')) {
						const ready = resolver;
						resolver = undefined;
						ready(buffer);
					}
				});
				resolve({
					status: res.statusCode,
					res,
					request,
					readEvent: async expected => {
						const result = await new Promise<string>(resolveEvent => {
							if (buffer.includes(`event: ${expected}\\n`)) {
								resolveEvent(buffer);
							} else {
								resolver = resolveEvent;
							}
						});
						return result;
					},
				});
			},
		);
		request.on('error', reject);
	});
}

describe('NextUI SSE transport', () => {
	it('rejects disabled or unauthorized streams', async () => {
		const server = new NextuiWebServer({
			port: 0, bindAddress: '127.0.0.1', instance: 'nextui.0', version: '0.0.1',
			authenticator: new HttpAuthenticator('a-long-test-access-password'),
		});
		await server.start();
		try {
			const port = server.getStatus().port;
			const noAuth = await fetchStream(port, '/api/datapoints/events?id=safe.0.temperature');
			expect(noAuth.status).to.equal(401);
			noAuth.request.destroy();
			const auth = `Basic ${Buffer.from('nextui:a-long-test-access-password').toString('base64')}`;
			const disabled = await fetchStream(port, '/api/datapoints/events?id=safe.0.temperature', auth);
			expect(disabled.status).to.equal(403);
			disabled.request.destroy();
		} finally {
			await server.stop();
		}
	});

	it('sends initial data and pushed updates and disposes the subscriber on disconnect', async () => {
		const current: DatapointListItem = {
			id: 'safe.0.temperature', name: 'Temperature', type: 'number',
			value: 21, readable: true, writable: false,
		};
		let onChange: ((id: string) => void) | undefined;
		let disposed = 0;
		let allowed = true;
		const server = new NextuiWebServer({
			port: 0, bindAddress: '127.0.0.1', instance: 'nextui.0', version: '0.0.1',
			datapointApiEnabled: true,
			datapointApi: {
				get: id => Promise.resolve(allowed && id === current.id ? { ...current } : undefined),
				list: () => Promise.resolve({ items: [], total: 0, offset: 0, limit: 25 }),
			},
			liveHub: {
				subscribe: (_ids, listener) => {
					onChange = listener;
					return Promise.resolve(() => {
						disposed++;
						return Promise.resolve();
					});
				},
			},
		});
		await server.start();
		try {
			const port = server.getStatus().port;
			const client = await fetchStream(port, '/api/datapoints/events?id=safe.0.temperature');
			expect(client.status).to.equal(200);
			expect(client.res.headers['content-type']).to.contain('text/event-stream');
			expect(await client.readEvent('datapoint')).to.contain('"value":21');
			current.value = 24;
			onChange?.('safe.0.temperature');
			// Read the streaming output until the new value is observed.
			await new Promise<void>((resolve, reject) => {
				let buffer = '';
				const timer = setTimeout(() => reject(new Error('Timed out waiting for live update')), 1_500);
				const handler = (chunk: Buffer): void => {
					buffer += chunk.toString('utf8');
					if (buffer.includes('"value":24')) {
						clearTimeout(timer);
						client.res.off('data', handler);
						resolve();
					}
				};
				client.res.on('data', handler);
			});
			allowed = false;
			onChange?.('safe.0.temperature');
			expect(await client.readEvent('removed')).to.contain('event: removed');
			client.request.destroy();
			await new Promise(resolve => setTimeout(resolve, 30));
			expect(disposed).to.equal(1);
		} finally {
			await server.stop();
		}
	});

	it('validates exact IDs before opening a stream', async () => {
		const server = new NextuiWebServer({
			port: 0, bindAddress: '127.0.0.1', instance: 'nextui.0', version: '0.0.1',
			datapointApiEnabled: true,
			datapointApi: {
				get: () => Promise.resolve(undefined),
				list: () => Promise.resolve({ items: [], total: 0, offset: 0, limit: 25 }),
			},
			liveHub: { subscribe: () => Promise.resolve(() => Promise.resolve()) },
		});
		await server.start();
		try {
			const port = server.getStatus().port;
			for (const path of [
				'/api/datapoints/events',
				'/api/datapoints/events?id=*',
				'/api/datapoints/events?id=safe.0.a&id=safe.0.a',
			]) {
				const response = await fetchStream(port, path);
				expect(response.status).to.equal(400);
				response.request.destroy();
			}
			const missing = await fetchStream(port, '/api/datapoints/events?id=unsafe.0.private');
			expect(missing.status).to.equal(404);
			missing.request.destroy();
		} finally {
			await server.stop();
		}
	});
});
