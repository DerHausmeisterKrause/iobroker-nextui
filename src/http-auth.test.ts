import { expect } from 'chai';
import { HttpAuthenticator } from './http-auth';

describe('HttpAuthenticator', () => {
	const password = 'test-password-at-least-16-characters';
	const basic = (user: string, secret: string): string =>
		`Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;

	it('rejects short secrets and accepts only exact credentials', () => {
		expect(() => new HttpAuthenticator('too-short')).to.throw('mindestens 16');
		const auth = new HttpAuthenticator(password);
		expect(auth.verify(undefined, '127.0.0.1').allowed).to.equal(false);
		expect(auth.verify('Bearer token', '127.0.0.1').allowed).to.equal(false);
		expect(auth.verify(basic('nextui', 'wrong-password'), '127.0.0.1').allowed).to.equal(false);
		expect(auth.verify(basic('admin', password), '127.0.0.1').allowed).to.equal(false);
		expect(auth.verify(basic('nextui', password), '127.0.0.1').allowed).to.equal(true);
	});

	it('rate-limits repeated guesses and resets the limit after a minute', () => {
		let time = 10_000;
		const auth = new HttpAuthenticator(password, () => time);
		for (let attempt = 0; attempt < 5; attempt++) {
			expect(auth.verify(undefined, 'client-a').allowed).to.equal(false);
		}
		expect(auth.verify(basic('nextui', password), 'client-a')).to.deep.equal({
			allowed: false,
			retryAfterSeconds: 60,
		});
		expect(auth.verify(basic('nextui', password), 'client-b').allowed).to.equal(true);
		time += 60_001;
		expect(auth.verify(basic('nextui', password), 'client-a').allowed).to.equal(true);
	});

	it('treats malformed and oversized authorization values as invalid', () => {
		const auth = new HttpAuthenticator(password);
		for (const value of ['Basic not base64!', 'Basic ', `Basic ${'A'.repeat(2000)}`]) {
			expect(auth.verify(value, value).allowed).to.equal(false);
		}
	});
});
