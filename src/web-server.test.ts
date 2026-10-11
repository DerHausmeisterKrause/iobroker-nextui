import { createServer, get as httpGet } from 'node:http';
import { expect } from 'chai';
import { NextuiWebServer } from './web-server';

describe('NextuiWebServer', () => {
	it('starts, serves the page and health endpoint, then stops', async () => {
		const port = await getFreePort();
		const server = new NextuiWebServer({ port, bindAddress: '127.0.0.1', instance: 'nextui.0', version: '0.0.1' });
		await server.start();
		expect(server.getStatus().running).to.equal(true);
		const page = await request(port, '/');
		const health = await request(port, '/api/health');
		expect(page.statusCode).to.equal(200);
		expect(page.body).to.contain('Visualisierung befindet sich in Entwicklung');
		expect(health.statusCode).to.equal(200);
		expect(JSON.parse(health.body)).to.deep.include({ status: 'ok' });
		expect(JSON.parse(health.body).server).to.include({ instance: 'nextui.0', version: '0.0.1' });
		await server.stop();
		expect(server.getStatus().running).to.equal(false);
		try {
			await request(port, '/');
			throw new Error('Request unexpectedly succeeded after stop');
		} catch (error) {
			expect((error as Error).message).to.not.equal('Request unexpectedly succeeded after stop');
		}
	});

	it('reports a useful error for a port conflict', async () => {
		const port = await getFreePort();
		const first = new NextuiWebServer({ port, bindAddress: '127.0.0.1', instance: 'nextui.0', version: '0.0.1' });
		const second = new NextuiWebServer({ port, bindAddress: '127.0.0.1', instance: 'nextui.1', version: '0.0.1' });
		await first.start();
		try {
			await second.start();
			throw new Error('Second server unexpectedly started');
		} catch (error) {
			expect((error as Error).message).to.equal(`Port ${port} auf 127.0.0.1 ist bereits belegt.`);
		}
		await first.stop();
	});

	it('supports two independent instances on different ports', async () => {
		const firstPort = await getFreePort();
		const secondPort = await getFreePort();
		const first = new NextuiWebServer({
			port: firstPort,
			bindAddress: '127.0.0.1',
			instance: 'nextui.0',
			version: '0.0.1',
		});
		const second = new NextuiWebServer({
			port: secondPort,
			bindAddress: '127.0.0.1',
			instance: 'nextui.1',
			version: '0.0.1',
		});
		await Promise.all([first.start(), second.start()]);
		const [firstHealth, secondHealth] = await Promise.all([
			request(firstPort, '/api/health'),
			request(secondPort, '/api/health'),
		]);
		expect(JSON.parse(firstHealth.body).server.instance).to.equal('nextui.0');
		expect(JSON.parse(secondHealth.body).server.instance).to.equal('nextui.1');
		await Promise.all([first.stop(), second.stop()]);
	});
});

async function getFreePort(): Promise<number> {
	const server = createServer();
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				reject(new Error('Could not determine free port'));
				return;
			}
			server.close(error => (error ? reject(error) : resolve(address.port)));
		});
	});
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
