import { get as httpGet } from 'node:http';
import { expect } from 'chai';
import { NextuiWebServer } from './web-server';

describe('NextuiWebServer', () => {
	it('starts, serves the page and health endpoint, then stops', async () => {
		const server = createServer();
		await server.start();
		expect(server.getStatus().running).to.equal(true);
		const page = await request(server.getStatus().port, '/');
		const health = await request(server.getStatus().port, '/api/health');
		expect(page.statusCode).to.equal(200);
		expect(page.body).to.contain('Visualisierung befindet sich in Entwicklung');
		expect(health.statusCode).to.equal(200);
		expect(JSON.parse(health.body)).to.deep.include({ status: 'ok' });
		expect(JSON.parse(health.body).server).to.include({ instance: 'nextui.0', version: '0.0.1' });

		const port = server.getStatus().port;
		await server.stop();
		expect(server.getStatus().running).to.equal(false);
		await expectConnectionError(port);
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

function request(port: number, path: string): Promise<{ statusCode?: number; body: string }> {
	return new Promise((resolve, reject) => {
		const request = httpGet({ hostname: '127.0.0.1', port, path }, response => {
			const chunks: Buffer[] = [];
			response.on('data', chunk => chunks.push(Buffer.from(chunk)));
			response.on('end', () =>
				resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }),
			);
		});
		request.once('error', reject);
	});
}
