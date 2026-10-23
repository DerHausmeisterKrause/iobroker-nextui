import { get as httpGet } from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect } from 'chai';
import { NextuiWebServer } from './web-server';
import { HttpAuthenticator } from './http-auth';

describe('NextuiWebServer', () => {
	it('starts, serves the page and health endpoint, then stops', async () => {
		const server = createServer();
		await server.start();
		expect(server.getStatus().running).to.equal(true);
		const page = await request(server.getStatus().port, '/');
		const health = await request(server.getStatus().port, '/api/health');
		expect(page.statusCode).to.equal(200);
		expect(page.body).to.match(/Visualisierung befindet sich in Entwicklung|<div id="root"><\/div>/);
		expect(health.statusCode).to.equal(200);
		expect(JSON.parse(health.body)).to.deep.include({ status: 'ok' });
		expect(JSON.parse(health.body).server).to.include({ instance: 'nextui.0', version: '0.0.1' });

		const port = server.getStatus().port;
		await server.stop();
		expect(server.getStatus().running).to.equal(false);
		await expectConnectionError(port);
	});

	it('protects the entire UI, health endpoint and datapoint APIs when a password is configured', async () => {
		const server = new NextuiWebServer({
			port: 0,
			bindAddress: '127.0.0.1',
			instance: 'nextui.0',
			version: '0.0.1',
			authenticator: new HttpAuthenticator('a-long-test-access-password'),
			datapointApiEnabled: true,
			datapointApi: {
				get: () => Promise.resolve(undefined),
				list: () => Promise.resolve({ items: [], total: 0, offset: 0, limit: 25 }),
			},
		});
		await server.start();
		try {
			const port = server.getStatus().port;
			for (const path of ['/', '/api/health', '/api/datapoints']) {
				const anonymous = await request(port, path);
				expect(anonymous.statusCode).to.equal(401);
				expect(anonymous.headers['www-authenticate']).to.contain('Basic realm="NextUI"');
			}
			const wrong = await request(port, '/api/health', 'Basic ' + Buffer.from('nextui:wrong').toString('base64'));
			expect(wrong.statusCode).to.equal(401);
			const validAuth = 'Basic ' + Buffer.from('nextui:a-long-test-access-password').toString('base64');
			expect((await request(port, '/', validAuth)).statusCode).to.equal(200);
			expect((await request(port, '/api/health', validAuth)).statusCode).to.equal(200);
			expect((await request(port, '/api/datapoints', validAuth)).statusCode).to.equal(200);
			expect((await request(port, '/api/datapoints/by-id?id=safe.0.state', validAuth)).statusCode).to.equal(404);
		} finally {
			await server.stop();
		}
	});

	it('keeps the datapoint API disabled unless development mode is explicitly enabled', async () => {
		const disabled = createServer();
		await disabled.start();
		try {
			const valueResponse = await request(disabled.getStatus().port, '/api/datapoints/by-id?id=test.0.value');
			expect(valueResponse.statusCode).to.equal(403);
			const response = await request(disabled.getStatus().port, '/api/datapoints');
			expect(response.statusCode).to.equal(403);
			expect(response.body).to.equal('{"error":"Datapoint API is disabled"}');
		} finally {
			await disabled.stop();
		}
	});

	it('serves paginated datapoints only through the dedicated API route', async () => {
		const server = new NextuiWebServer({
			port: 0,
			bindAddress: '127.0.0.1',
			instance: 'nextui.0',
			version: '0.0.1',
			datapointApiEnabled: true,
			datapointApi: {
				get: id =>
					Promise.resolve(
						id === 'test.0.value'
							? { id, name: 'Value', type: 'number', value: 1, readable: true, writable: false }
							: undefined,
					),
				list: query =>
					Promise.resolve({
						items: [
							{
								id: 'test.0.value',
								name: 'Value',
								type: 'number',
								value: 1,
								readable: true,
								writable: false,
							},
						],
						total: 1,
						offset: query.offset ?? 0,
						limit: query.limit ?? 50,
					}),
			},
		});
		await server.start();
		try {
			const response = await request(
				server.getStatus().port,
				'/api/datapoints?search=value&types=number&limit=10',
			);
			expect(response.statusCode).to.equal(200);
			expect(JSON.parse(response.body)).to.deep.include({ total: 1, limit: 10 });
			const exact = await request(server.getStatus().port, '/api/datapoints/by-id?id=test.0.value');
			expect(exact.statusCode).to.equal(200);
			expect(JSON.parse(exact.body).item.id).to.equal('test.0.value');
			const missing = await request(server.getStatus().port, '/api/datapoints/by-id?id=test.0.other');
			expect(missing.statusCode).to.equal(404);
			const badId = await request(server.getStatus().port, '/api/datapoints/by-id?id=*');
			expect(badId.statusCode).to.equal(400);
			const invalid = await request(server.getStatus().port, '/api/datapoints?offset=-1');
			expect(invalid.statusCode).to.equal(400);
		} finally {
			await server.stop();
		}
	});

	it('serves built frontend files and falls back to the SPA entry point', async () => {
		const frontendDirectory = await mkdtemp(join(tmpdir(), 'nextui-frontend-'));
		const outsideDirectory = await mkdtemp(join(tmpdir(), 'nextui-outside-'));
		await mkdir(join(frontendDirectory, 'assets'));
		await mkdir(join(frontendDirectory, 'assets', 'directory'));
		await writeFile(join(frontendDirectory, 'index.html'), '<main>NextUI frontend</main>');
		await writeFile(join(frontendDirectory, 'assets', 'app.js'), 'console.log("nextui");');
		await writeFile(join(outsideDirectory, 'secret.txt'), 'outside frontend root');
		await symlink(join(outsideDirectory, 'secret.txt'), join(frontendDirectory, 'assets', 'linked.txt'));
		const server = new NextuiWebServer({
			port: 0,
			bindAddress: '127.0.0.1',
			instance: 'nextui.0',
			version: '0.0.1',
			frontendDirectory,
		});

		try {
			await server.start();
			const port = server.getStatus().port;
			const [index, asset, route, traversal, apiRoute, apiRoot, invalid, linked, directory] = await Promise.all([
				request(port, '/'),
				request(port, '/assets/app.js'),
				request(port, '/raeume'),
				request(port, '/%2e%2e/package.json'),
				request(port, '/api/unknown'),
				request(port, '/api'),
				request(port, '/assets/%E0%A4%A'),
				request(port, '/assets/linked.txt'),
				request(port, '/assets/directory'),
			]);
			expect(index.body).to.contain('NextUI frontend');
			expect(asset.body).to.contain('console.log');
			expect(asset.headers['content-type']).to.contain('text/javascript');
			expect(route.body).to.contain('NextUI frontend');
			expect(traversal.statusCode).to.equal(404);
			expect(apiRoute.statusCode).to.equal(404);
			expect(apiRoute.body).to.equal('{"error":"Not found"}');
			expect(apiRoot.statusCode).to.equal(404);
			expect(invalid.statusCode).to.equal(400);
			expect(linked.statusCode).to.equal(404);
			expect(directory.statusCode).to.equal(404);
		} finally {
			await server.stop();
			await rm(frontendDirectory, { recursive: true, force: true });
			await rm(outsideDirectory, { recursive: true, force: true });
		}
	});

	it('serves the packaged frontend build from the default directory', async () => {
		const server = createServer();
		await server.start();
		const port = server.getStatus().port;

		try {
			const index = await request(port, '/');
			const assetPath = index.body.match(/src="(\/assets\/[^"']+\.js)"/)?.[1];
			expect(index.body).to.contain('<div id="root"></div>');
			expect(assetPath).to.be.a('string');
			const asset = await request(port, assetPath!);
			expect(asset.statusCode).to.equal(200);
			expect(asset.headers['content-type']).to.contain('text/javascript');
			const icon = await request(port, '/nextui-icon.png');
			expect(icon.statusCode).to.equal(200);
			expect(icon.headers['content-type']).to.contain('image/png');
		} finally {
			await server.stop();
		}
	});

	it('reports a useful error for a port conflict', async () => {
		const first = createServer();
		await first.start();
		const port = first.getStatus().port;
		const second = createServer(port, 'nextui.1');

		try {
			await second.start();
			throw new Error('Second server unexpectedly started');
		} catch (error) {
			expect((error as Error).message).to.equal(`Port ${port} auf 127.0.0.1 ist bereits belegt.`);
		}
		await first.stop();
		await second.stop();
	});

	it('coalesces parallel start calls', async () => {
		const server = createServer();
		await Promise.all([server.start(), server.start(), server.start()]);
		expect(server.getStatus().running).to.equal(true);
		await server.stop();
	});

	it('serializes a start and stop requested at the same time', async () => {
		const server = createServer();
		const startPromise = server.start();
		const portPromise = startPromise.then(() => server.getStatus().port);
		const stopPromise = server.stop();
		const port = await portPromise;
		await stopPromise;
		expect(server.getStatus().running).to.equal(false);
		await expectConnectionError(port);

		await server.start();
		expect(server.getStatus().running).to.equal(true);
		await server.stop();
	});

	it('supports two independent instances on dynamically assigned ports', async () => {
		const first = createServer(0, 'nextui.0');
		const second = createServer(0, 'nextui.1');
		await Promise.all([first.start(), second.start()]);
		expect(first.getStatus().port).to.not.equal(second.getStatus().port);
		const [firstHealth, secondHealth] = await Promise.all([
			request(first.getStatus().port, '/api/health'),
			request(second.getStatus().port, '/api/health'),
		]);
		expect(JSON.parse(firstHealth.body).server.instance).to.equal('nextui.0');
		expect(JSON.parse(secondHealth.body).server.instance).to.equal('nextui.1');
		await Promise.all([first.stop(), second.stop()]);
	});
});

function createServer(port = 0, instance = 'nextui.0'): NextuiWebServer {
	return new NextuiWebServer({ port, bindAddress: '127.0.0.1', instance, version: '0.0.1' });
}

async function expectConnectionError(port: number): Promise<void> {
	try {
		await request(port, '/');
		throw new Error('Request unexpectedly succeeded after stop');
	} catch (error) {
		expect(error).to.be.instanceOf(Error);
		expect((error as NodeJS.ErrnoException).code).to.match(/^ECONN/);
	}
}

function request(
	port: number,
	path: string,
	authorization?: string,
): Promise<{ statusCode?: number; body: string; headers: Record<string, string | string[] | undefined> }> {
	return new Promise((resolve, reject) => {
		const request = httpGet({ hostname: '127.0.0.1', port, path, headers: authorization ? { authorization } : {} }, response => {
			const chunks: Buffer[] = [];
			response.on('data', chunk => chunks.push(Buffer.from(chunk)));
			response.on('end', () =>
				resolve({
					statusCode: response.statusCode,
					body: Buffer.concat(chunks).toString('utf8'),
					headers: response.headers,
				}),
			);
		});
		request.once('error', reject);
	});
}
