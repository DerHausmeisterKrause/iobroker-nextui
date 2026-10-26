import { execFileSync } from 'node:child_process';
import { get as httpsGet } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect } from 'chai';
import { resolveTlsOptions, type IoBrokerCertificateProvider } from './server-tls';
import { NextuiWebServer } from './web-server';

describe('NextUI built-in HTTPS server', function () {
	this.timeout(10_000);

	it('serves the existing health route over native HTTPS using user-provided PEM files', async function () {
		try {
			execFileSync('openssl', ['version'], { stdio: 'ignore' });
		} catch {
			this.skip();
			return;
		}
		const folder = await mkdtemp(join(tmpdir(), 'nextui-https-'));
		const keyFile = join(folder, 'key.pem');
		const certFile = join(folder, 'cert.pem');
		let server: NextuiWebServer | undefined;
		try {
			execFileSync(
				'openssl',
				[
					'req',
					'-x509',
					'-newkey',
					'rsa:2048',
					'-nodes',
					'-keyout',
					keyFile,
					'-out',
					certFile,
					'-days',
					'1',
					'-subj',
					'/CN=localhost',
				],
				{ stdio: 'ignore', timeout: 5_000 },
			);
			const provider: IoBrokerCertificateProvider = {
				getCertificatesAsync: () => Promise.resolve([null]),
				getForeignObjectAsync: () => Promise.resolve(null),
			};
			const options = await resolveTlsOptions({ source: 'files', certFile, keyFile }, provider);
			server = new NextuiWebServer({
				port: 0,
				bindAddress: '127.0.0.1',
				transport: 'https',
				tlsOptions: options,
				instance: 'nextui.0',
				version: '0.0.1',
			});
			await server.start();
			const port = server.getStatus().port;
			expect(server.getStatus().transport).to.equal('https');
			const health = await new Promise<{ status?: number; body: string }>((resolve, reject) => {
				const req = httpsGet(
					{
						hostname: '127.0.0.1',
						port,
						path: '/api/health',
						rejectUnauthorized: false,
					},
					response => {
						const chunks: Buffer[] = [];
						response.on('data', chunk => chunks.push(Buffer.from(chunk)));
						response.on('end', () =>
							resolve({
								status: response.statusCode,
								body: Buffer.concat(chunks).toString('utf8'),
							}),
						);
					},
				);
				req.on('error', reject);
			});
			expect(health.status).to.equal(200);
			expect(JSON.parse(health.body).status).to.equal('ok');
			expect(JSON.parse(health.body).server.transport).to.equal('https');
			expect((await readFile(certFile, 'utf8')).includes('BEGIN CERTIFICATE')).to.equal(true);
		} finally {
			if (server) {
				await server.stop();
			}
			await rm(folder, { recursive: true, force: true });
		}
	});
});
