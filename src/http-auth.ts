import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 2_000;
const USERNAME = 'nextui';

export interface AuthDecision {
	allowed: boolean;
	retryAfterSeconds?: number;
}

interface FailureRecord {
	count: number;
	firstFailure: number;
}

/** A single-user HTTP Basic gate for local-only NextUI behind an HTTPS reverse proxy. */
export class HttpAuthenticator {
	private readonly expectedDigest: Buffer;
	private readonly failures = new Map<string, FailureRecord>();

	public constructor(
		password: string,
		private readonly now: () => number = Date.now,
	) {
		if (password.length < 16) {
			throw new Error('Das NextUI-Zugangspasswort muss mindestens 16 Zeichen lang sein.');
		}
		this.expectedDigest = this.digest(`${USERNAME}:${password}`);
	}

	public verify(header: string | undefined, remoteAddress: string | undefined): AuthDecision {
		const client = remoteAddress || 'unknown';
		const now = this.now();
		const failure = this.failures.get(client);
		if (failure && now - failure.firstFailure < FAILURE_WINDOW_MS && failure.count >= MAX_FAILURES) {
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil((FAILURE_WINDOW_MS - (now - failure.firstFailure)) / 1_000)),
			};
		}
		if (failure && now - failure.firstFailure >= FAILURE_WINDOW_MS) {
			this.failures.delete(client);
		}

		const credentials = this.decodeBasic(header);
		const actual = this.digest(credentials);
		if (credentials !== '' && timingSafeEqual(actual, this.expectedDigest)) {
			this.failures.delete(client);
			return { allowed: true };
		}
		const existing = this.failures.get(client);
		if (existing) {
			existing.count++;
		} else {
			if (this.failures.size >= MAX_TRACKED_CLIENTS) {
				this.failures.delete(this.failures.keys().next().value ?? '');
			}
			this.failures.set(client, { count: 1, firstFailure: now });
		}
		return { allowed: false };
	}

	private decodeBasic(header: string | undefined): string {
		if (!header || header.length > 1_024) {
			return '';
		}
		const match = /^Basic ([a-zA-Z0-9+/]+={0,2})$/i.exec(header);
		if (!match) {
			return '';
		}
		try {
			const buffer = Buffer.from(match[1], 'base64');
			if (buffer.length > 512) {
				return '';
			}
			const decoded = buffer.toString('utf8');
			return decoded.includes(':') ? decoded : '';
		} catch {
			return '';
		}
	}

	private digest(value: string): Buffer {
		return createHash('sha256').update(value, 'utf8').digest();
	}
}
