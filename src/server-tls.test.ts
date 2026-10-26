import { expect } from 'chai';
import { isLoopbackAddress, resolveTlsOptions, validateHttpTransport, type IoBrokerCertificateProvider } from './server-tls';

describe('NextUI direct HTTP/HTTPS configuration', () => {
	const provider: IoBrokerCertificateProvider = {
		getCertificatesAsync: () => Promise.resolve([null]),
		getForeignObjectAsync: () => Promise.resolve(null),
	};

	it('supports loopback HTTP and explicitly opted-in HTTP LAN, but rejects accidental exposure', () => {
		expect(isLoopbackAddress('127.0.0.1')).to.equal(true);
		expect(isLoopbackAddress('::1')).to.equal(true);
		expect(isLoopbackAddress('LOCALHOST')).to.equal(true);
		expect(isLoopbackAddress('0.0.0.0')).to.equal(false);
		expect(() => validateHttpTransport({
			transport: 'http', bindAddress: '127.0.0.1', allowInsecureHttpLan: false,
		})).not.to.throw();
		expect(() => validateHttpTransport({
			transport: 'http', bindAddress: '0.0.0.0', allowInsecureHttpLan: false,
		})).to.throw('ausdrückliche Freigabe');
		expect(() => validateHttpTransport({
			transport: 'http', bindAddress: '0.0.0.0', allowInsecureHttpLan: true,
		})).not.to.throw();
		expect(() => validateHttpTransport({
			transport: 'https', bindAddress: '192.168.178.79', allowInsecureHttpLan: false,
		})).not.to.throw();
	});

	it('fails closed when a configured ioBroker TLS certificate is missing', async () => {
		try {
			await resolveTlsOptions({ source: 'iobroker' }, provider);
			throw new Error('Missing cert unexpectedly accepted');
		} catch (error) {
			expect((error as Error).message).to.contain('konnten nicht geladen');
		}
	});

	it('calls ioBroker certificate API with selected names', async () => {
		const names: string[] = [];
		const configured: IoBrokerCertificateProvider = {
			getCertificatesAsync: (publicName, privateName, chainName) => {
				names.push(publicName, privateName, chainName);
				return Promise.resolve([{ cert: 'invalid', key: 'invalid' }]);
			},
			getForeignObjectAsync: () => Promise.resolve(null),
		};
		try {
			await resolveTlsOptions({
				source: 'iobroker', publicCertificate: 'myPublic',
				privateCertificate: 'myPrivate', chainCertificate: 'myChain',
			}, configured);
		} catch {
			// Expected: secure context creation rejects a fake certificate/key.
		}
		expect(names).to.deep.equal(['myPublic', 'myPrivate', 'myChain']);
	});

	it('rejects unknown collections, absent PEM values and relative certificate paths', async () => {
		for (const source of [
			{ source: 'collection', collectionId: 'missing' },
			{ source: 'pem', certPem: '', keyPem: '' },
			{ source: 'files', certFile: 'relative.crt', keyFile: '/tmp/private.pem' },
		] as const) {
			try {
				await resolveTlsOptions(source, provider);
				throw new Error('Missing or invalid certificate accepted');
			} catch (error) {
				expect((error as Error).message).to.match(/TLS:/);
			}
		}
	});
});
