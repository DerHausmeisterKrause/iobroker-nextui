import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createSecureContext, type SecureContextOptions } from 'node:tls';

/** TLS sources can be selected independently for every NextUI adapter instance. */
export type TlsCertificateSource = 'iobroker' | 'collection' | 'pem' | 'files';
export type WebTransport = 'http' | 'https';

export interface TlsConfig {
	source: TlsCertificateSource;
	publicCertificate?: string;
	privateCertificate?: string;
	chainCertificate?: string;
	collectionId?: string;
	certPem?: string;
	keyPem?: string;
	certFile?: string;
	keyFile?: string;
	chainFile?: string;
}

export interface CertificatesFromIoBroker {
	key: string;
	cert: string;
	ca?: string;
}

export interface IoBrokerCertificateProvider {
	getCertificatesAsync(publicName: string, privateName: string, chainName: string): Promise<
		[CertificatesFromIoBroker | null | undefined, ...unknown[]]
	>;
	getForeignObjectAsync(id: string): Promise<ioBroker.Object | null | undefined>;
}

export function validateHttpTransport(input: {
	transport: WebTransport;
	bindAddress: string;
	allowInsecureHttpLan: boolean;
}): void {
	if (input.transport !== 'http' && input.transport !== 'https') {
		throw new Error('NextUI-Protokoll muss HTTP oder HTTPS sein.');
	}
	const local = isLoopbackAddress(input.bindAddress);
	if (!local && input.transport === 'http' && !input.allowInsecureHttpLan) {
		throw new Error('HTTP im LAN benötigt die ausdrückliche Freigabe „Unsicheres HTTP im LAN erlauben“.');
	}
}

export function isLoopbackAddress(address: string): boolean {
	return ['localhost', '127.0.0.1', '::1'].includes(address.toLowerCase());
}

function requirePem(value: string | undefined, description: string): string {
	if (!value || !value.includes('-----BEGIN ')) {
		throw new Error(`TLS: ${description} fehlt oder ist kein gültiger PEM-Inhalt.`);
	}
	return value;
}

function readRequiredFile(path: string | undefined, name: string): Promise<string> {
	if (!path || !isAbsolute(path)) {
		throw new Error(`TLS: ${name} muss ein absoluter Dateipfad sein.`);
	}
	return readFile(path, { encoding: 'utf8' });
}

export async function resolveTlsOptions(
	config: TlsConfig,
	provider: IoBrokerCertificateProvider,
): Promise<SecureContextOptions> {
	let result: SecureContextOptions;
	switch (config.source) {
		case 'iobroker': {
			const all = await provider.getCertificatesAsync(
				config.publicCertificate || 'defaultPublic',
				config.privateCertificate || 'defaultPrivate',
				config.chainCertificate || '',
			);
			const certs = all?.[0];
			if (!certs?.key || !certs.cert) {
				throw new Error('TLS: Die ausgewählten ioBroker-Zertifikate konnten nicht geladen werden.');
			}
			result = { key: certs.key, cert: certs.cert, ca: certs.ca };
			break;
		}
		case 'collection': {
			const id = config.collectionId?.trim();
			if (!id) {
				throw new Error('TLS: Eine ioBroker-Zertifikatskollektion muss ausgewählt werden.');
			}
			const obj = await provider.getForeignObjectAsync('system.certificates');
			const raw = (obj?.native as { collections?: Record<string, unknown> } | undefined)?.collections?.[id];
			if (!raw || typeof raw !== 'object') {
				throw new Error('TLS: Die gewählte Zertifikatskollektion ist nicht vorhanden.');
			}
			const collection = raw as { cert?: string; key?: string; chain?: string | string[] };
			const chain = Array.isArray(collection.chain) ? collection.chain.join('\n') : collection.chain;
			result = {
				cert: requirePem(collection.cert, 'Zertifikat') + (chain ? `\n${chain}` : ''),
				key: requirePem(collection.key, 'Privatschlüssel'),
			};
			break;
		}
		case 'pem': {
			result = {
				cert: requirePem(config.certPem, 'Zertifikat'),
				key: requirePem(config.keyPem, 'Privatschlüssel'),
			};
			break;
		}
		case 'files': {
			const [cert, key, chain] = await Promise.all([
				readRequiredFile(config.certFile, 'Zertifikatsdatei'),
				readRequiredFile(config.keyFile, 'Schlüsseldatei'),
				config.chainFile ? readRequiredFile(config.chainFile, 'Kettendatei') : Promise.resolve(''),
			]);
			result = { cert: cert + (chain ? `\n${chain}` : ''), key };
			break;
		}
		default:
			throw new Error('TLS: Unbekannte Zertifikatsquelle.');
	}
	// Validate the certificate/key pair up front; never silently start an HTTP server on TLS failure.
	createSecureContext({ ...result, minVersion: 'TLSv1.2' });
	return result;
}
