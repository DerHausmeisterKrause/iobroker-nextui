import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { SecureContextOptions } from 'node:tls';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { HttpAuthenticator } from './http-auth';
import type { DatapointLiveHub } from './datapoint-live-hub';
import { DashboardConflictError, InvalidDashboardError, type DashboardStore } from './dashboard-store';
import type { DatapointListItem, DatapointListResponse, DatapointQuery } from './datapoint-api';

export interface WebServerOptions {
	port: number;
	bindAddress: string;
	instance: string;
	version: string;
	frontendDirectory?: string;
	transport?: 'http' | 'https';
	tlsOptions?: SecureContextOptions;
	authenticator?: HttpAuthenticator;
	dashboardStore?: DashboardStore;
	datapointApi?: {
		list(query: DatapointQuery): Promise<DatapointListResponse>;
		get(id: string): Promise<DatapointListItem | undefined>;
	};
	datapointApiEnabled?: boolean;
	datapointApiStatusHint?: string;
	liveHub?: Pick<DatapointLiveHub, 'subscribe'>;
	onError?: (error: Error) => void;
}

export interface WebServerStatus {
	running: boolean;
	port: number;
	bindAddress: string;
	instance: string;
	version: string;
	transport: 'http' | 'https';
}

type LifecycleOperation = () => Promise<void>;
type FileResult = 'served' | 'missing' | 'not-servable';

class InvalidRequestError extends Error {}
class PayloadTooLargeError extends Error {}

export class NextuiWebServer {
	private server: Server | undefined;
	private listeningPort: number | undefined;
	private lifecycle: Promise<void> = Promise.resolve();
	private readonly eventClients = new Set<ServerResponse>();

	public constructor(private readonly options: WebServerOptions) {}

	public start(): Promise<void> {
		return this.enqueue(async () => {
			if (this.server?.listening) {
				return;
			}
			await this.startServer();
		});
	}

	public stop(): Promise<void> {
		return this.enqueue(async () => {
			const server = this.server;
			if (!server) {
				return;
			}

			this.server = undefined;
			this.listeningPort = undefined;
			for (const client of this.eventClients) {
				client.end();
			}
			this.eventClients.clear();
			server.closeAllConnections?.();
			await new Promise<void>(resolve => server.close(() => resolve()));
		});
	}

	public getStatus(): WebServerStatus {
		return {
			running: this.server?.listening === true,
			port: this.listeningPort ?? this.options.port,
			bindAddress: this.options.bindAddress,
			instance: this.options.instance,
			version: this.options.version,
			transport: this.options.transport ?? 'http',
		};
	}

	private enqueue(operation: LifecycleOperation): Promise<void> {
		const next = this.lifecycle.then(operation, operation);
		this.lifecycle = next.catch(() => undefined);
		return next;
	}

	private startServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			const handler = (request: IncomingMessage, response: ServerResponse): void => {
				void this.handleRequest(request, response).catch(error => {
					if (error instanceof DashboardConflictError) {
						this.sendJson(response, 409, { error: 'Dashboard was modified by another browser' });
						return;
					}
					if (error instanceof PayloadTooLargeError) {
						this.sendJson(response, 413, { error: 'Request body too large' });
						return;
					}
					if (error instanceof InvalidDashboardError) {
						this.sendJson(response, 400, { error: 'Invalid dashboard document' });
						return;
					}
					if (error instanceof InvalidRequestError) {
						if (!response.headersSent) {
							this.sendJson(response, 400, { error: 'Bad request' });
						}
						return;
					}
					this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
					if (!response.headersSent) {
						this.sendJson(response, 500, { error: 'Internal server error' });
					} else if (!response.writableEnded) {
						response.end();
					}
				});
			};
			const server =
				this.options.transport === 'https'
					? createHttpsServer({ ...this.options.tlsOptions, minVersion: 'TLSv1.2' }, handler)
					: createHttpServer(handler);
			this.server = server;

			const onRuntimeError = (error: NodeJS.ErrnoException): void => {
				const describedError = this.describeError(error);
				this.options.onError?.(describedError);
				if (!server.listening && this.server === server) {
					this.server = undefined;
					this.listeningPort = undefined;
				}
			};
			const onStartError = (error: NodeJS.ErrnoException): void => {
				server.removeListener('error', onRuntimeError);
				if (this.server === server) {
					this.server = undefined;
					this.listeningPort = undefined;
				}
				reject(this.describeError(error));
			};

			server.once('error', onStartError);
			server.on('error', onRuntimeError);
			server.listen(this.options.port, this.options.bindAddress, () => {
				server.removeListener('error', onStartError);
				const address = server.address();
				this.listeningPort = typeof address === 'object' && address ? address.port : this.options.port;
				resolve();
			});
		});
	}

	private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
		if (this.options.authenticator) {
			const result = this.options.authenticator.verify(
				request.headers.authorization,
				request.socket.remoteAddress,
			);
			if (!result.allowed) {
				const headers: Record<string, string> = {
					'Cache-Control': 'no-store',
					'Content-Type': 'application/json; charset=utf-8',
					'X-Content-Type-Options': 'nosniff',
					'WWW-Authenticate': 'Basic realm="NextUI", charset="UTF-8"',
				};
				if (result.retryAfterSeconds) {
					headers['Retry-After'] = String(result.retryAfterSeconds);
				}
				response.writeHead(result.retryAfterSeconds ? 429 : 401, headers);
				response.end(
					request.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Authentication required' }),
				);
				return;
			}
		}
		const requestUrl = new URL(request.url ?? '/', 'http://localhost');
		if (requestUrl.pathname === '/api/dashboard') {
			await this.handleDashboardRequest(request, response);
			return;
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			this.sendJson(response, 405, { error: 'Method not allowed' });
			return;
		}

		if (requestUrl.pathname === '/api/health') {
			this.sendJson(response, 200, {
				status: 'ok',
				server: this.getStatus(),
				features: {
					datapoints: {
						enabled: this.options.datapointApiEnabled === true,
						hint: this.options.datapointApiEnabled
							? undefined
							: (this.options.datapointApiStatusHint ??
								'Datenpunkt-API deaktiviert. Konfiguration und Allowlist prüfen.'),
					},
					dashboard: { enabled: !!this.options.dashboardStore && !!this.options.authenticator },
				},
			});
			return;
		}
		if (requestUrl.pathname === '/api/datapoints/events') {
			await this.handleDatapointEvents(requestUrl, request, response);
			return;
		}
		if (requestUrl.pathname === '/api/datapoints/by-id') {
			await this.handleExactDatapointRequest(requestUrl, response);
			return;
		}
		if (requestUrl.pathname === '/api/datapoints') {
			await this.handleDatapointRequest(requestUrl, response);
			return;
		}
		if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
			this.sendJson(response, 404, { error: 'Not found' });
			return;
		}
		if (await this.serveFrontendFile(requestUrl.pathname, request, response)) {
			return;
		}

		if (requestUrl.pathname === '/') {
			this.sendHtml(response, 200, this.renderPage());
			return;
		}

		this.sendJson(response, 404, { error: 'Not found' });
	}

	private async handleDashboardRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
		// Dashboard metadata is not accessible without an authenticated NextUI session.
		if (!this.options.authenticator || !this.options.dashboardStore) {
			this.sendJson(response, 403, { error: 'Configure a NextUI access password to enable dashboard storage' });
			return;
		}
		if (request.method === 'GET' || request.method === 'HEAD') {
			this.sendJson(response, 200, await this.options.dashboardStore.get());
			return;
		}
		if (request.method !== 'PUT') {
			this.sendJson(response, 405, { error: 'Method not allowed' });
			return;
		}
		// Basic credentials may be sent automatically by browsers. Block CSRF at the HTTP boundary.
		const origin = request.headers.origin;
		let sameOrigin = false;
		try {
			const parsed = new URL(origin ?? '');
			sameOrigin =
				(parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host === request.headers.host;
		} catch {
			// An absent, invalid or opaque origin is not a trusted write.
		}
		if (
			!sameOrigin ||
			request.headers['x-nextui-write'] !== '1' ||
			request.headers['sec-fetch-site'] === 'cross-site'
		) {
			this.sendJson(response, 403, { error: 'Same-origin write required' });
			return;
		}
		if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
			this.sendJson(response, 415, { error: 'Expected application/json' });
			return;
		}
		const maxBytes = 24_000;
		const declaredLength = Number(request.headers['content-length'] ?? 0);
		if (declaredLength > maxBytes) {
			this.sendJson(response, 413, { error: 'Request body too large' });
			return;
		}
		const chunks: Buffer[] = [];
		let bytes = 0;
		for await (const chunk of request) {
			const part = Buffer.from(chunk as Buffer);
			bytes += part.length;
			if (bytes > maxBytes) {
				throw new PayloadTooLargeError();
			}
			chunks.push(part);
		}
		let body: unknown;
		try {
			body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
		} catch {
			throw new InvalidDashboardError('Malformed JSON.');
		}
		this.sendJson(response, 200, await this.options.dashboardStore.put(body));
	}

	private async handleDatapointEvents(
		requestUrl: URL,
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		if (!this.options.datapointApiEnabled || !this.options.datapointApi || !this.options.liveHub) {
			this.sendJson(response, 403, { error: 'Live datapoint API is disabled' });
			return;
		}
		if (request.method !== 'GET') {
			this.sendJson(response, 405, { error: 'Method not allowed' });
			return;
		}
		const ids = requestUrl.searchParams.getAll('id');
		if (
			ids.length === 0 ||
			ids.length > 12 ||
			new Set(ids).size !== ids.length ||
			ids.some(id => !id || id.length > 512 || id.trim() !== id || id.includes('*') || id.includes('\0'))
		) {
			throw new InvalidRequestError('Invalid live datapoint IDs.');
		}
		const initial = await Promise.all(ids.map(id => this.options.datapointApi!.get(id)));
		if (initial.some(item => !item)) {
			this.sendJson(response, 404, { error: 'Datapoint not found or not readable' });
			return;
		}
		if (this.eventClients.size >= 24) {
			this.sendJson(response, 503, { error: 'Too many live connections' });
			return;
		}
		response.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-store, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
			'X-Content-Type-Options': 'nosniff',
		});
		this.eventClients.add(response);
		let closed = false;
		let unsubscribe: (() => Promise<void>) | undefined;
		let heartbeat: NodeJS.Timeout | undefined;
		const send = (event: string, data: unknown): void => {
			if (closed || response.destroyed || response.writableEnded) {
				return;
			}
			if (!response.write(`event: ${event}\\ndata: ${JSON.stringify(data)}\\n\\n`)) {
				// Drop a client which is not reading instead of buffering unlimited state values.
				response.destroy();
			}
		};
		const dispose = (): void => {
			if (closed) {
				return;
			}
			closed = true;
			this.eventClients.delete(response);
			if (heartbeat) {
				clearInterval(heartbeat);
			}
			if (unsubscribe) {
				void unsubscribe().catch(error =>
					this.options.onError?.(error instanceof Error ? error : new Error(String(error))),
				);
			}
		};
		response.once('close', dispose);
		try {
			unsubscribe = await this.options.liveHub.subscribe(ids, id => {
				void this.options
					.datapointApi!.get(id)
					.then(item => send(item ? 'datapoint' : 'removed', item ?? { id }))
					.catch(error => this.options.onError?.(error instanceof Error ? error : new Error(String(error))));
			});
			if (closed) {
				void unsubscribe().catch(error =>
					this.options.onError?.(error instanceof Error ? error : new Error(String(error))),
				);
				return;
			}
			for (const id of ids) {
				const item = await this.options.datapointApi.get(id);
				send(item ? 'datapoint' : 'removed', item ?? { id });
			}
			heartbeat = setInterval(() => {
				if (!response.destroyed && !response.writableEnded && !response.write(': keepalive\\n\\n')) {
					response.destroy();
				}
			}, 20_000);
		} catch (error) {
			response.destroy();
			throw error;
		}
	}

	private async handleExactDatapointRequest(requestUrl: URL, response: ServerResponse): Promise<void> {
		if (!this.options.datapointApiEnabled || !this.options.datapointApi) {
			this.sendJson(response, 403, { error: 'Datapoint API is disabled' });
			return;
		}
		const id = requestUrl.searchParams.get('id');
		if (!id || id.length > 512 || id.trim() !== id || id.includes('*') || id.includes('\0')) {
			throw new InvalidRequestError('Invalid datapoint ID.');
		}
		const item = await this.options.datapointApi.get(id);
		if (!item) {
			this.sendJson(response, 404, { error: 'Datapoint not found' });
			return;
		}
		this.sendJson(response, 200, { item });
	}

	private async handleDatapointRequest(requestUrl: URL, response: ServerResponse): Promise<void> {
		if (!this.options.datapointApiEnabled || !this.options.datapointApi) {
			this.sendJson(response, 403, { error: 'Datapoint API is disabled' });
			return;
		}
		const offset = parsePaginationParameter(requestUrl.searchParams.get('offset'), 'offset');
		const limit = parsePaginationParameter(requestUrl.searchParams.get('limit'), 'limit');
		const types = requestUrl.searchParams
			.get('types')
			?.split(',')
			.filter((type): type is 'boolean' | 'number' | 'string' | 'json' =>
				['boolean', 'number', 'string', 'json'].includes(type),
			);
		this.sendJson(
			response,
			200,
			await this.options.datapointApi.list({
				search: requestUrl.searchParams.get('search') ?? undefined,
				types,
				offset,
				limit,
			}),
		);
	}

	private async serveFrontendFile(
		pathname: string,
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<boolean> {
		const frontendDirectory = resolve(this.options.frontendDirectory ?? resolve(__dirname, '../www/frontend'));
		let decodedPath: string;
		try {
			decodedPath = decodeURIComponent(pathname);
		} catch {
			throw new InvalidRequestError('The request path is not valid percent-encoding.');
		}
		if (decodedPath.includes('\0')) {
			return false;
		}
		let frontendRoot: string;
		try {
			frontendRoot = await realpath(frontendDirectory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return false;
			}
			throw error;
		}

		const relativePath = decodedPath.replace(/^\/+/, '');
		const requestedFile = this.safeFrontendPath(frontendDirectory, relativePath || 'index.html');
		const requestedResult = requestedFile
			? await this.sendFile(requestedFile, frontendRoot, request, response)
			: 'not-servable';
		if (requestedResult === 'served') {
			return true;
		}
		if (requestedResult === 'not-servable') {
			return false;
		}

		if (pathname === '/' || extname(relativePath) === '') {
			const indexFile = this.safeFrontendPath(frontendDirectory, 'index.html');
			if (indexFile) {
				return (await this.sendFile(indexFile, frontendRoot, request, response)) === 'served';
			}
		}
		return false;
	}

	private safeFrontendPath(frontendDirectory: string, relativePath: string): string | undefined {
		const filePath = resolve(frontendDirectory, relativePath);
		return filePath.startsWith(`${frontendDirectory}${sep}`) ? filePath : undefined;
	}

	private async sendFile(
		filePath: string,
		frontendRoot: string,
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<FileResult> {
		try {
			const resolvedFile = await realpath(filePath);
			if (!resolvedFile.startsWith(`${frontendRoot}${sep}`)) {
				return 'not-servable';
			}
			if (!(await stat(resolvedFile)).isFile()) {
				return 'not-servable';
			}
			const content = await readFile(resolvedFile);
			response.writeHead(200, {
				'Cache-Control': 'no-store',
				'Content-Type': getContentType(filePath),
				'X-Content-Type-Options': 'nosniff',
			});
			response.end(request.method === 'HEAD' ? undefined : content);
			return 'served';
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'ENOENT' || code === 'ENOTDIR') {
				return 'missing';
			}
			if (code === 'EACCES' || code === 'EPERM') {
				if (!response.headersSent) {
					this.sendJson(response, 403, { error: 'Forbidden' });
				}
				return 'served';
			}
			throw error;
		}
	}

	private sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
		const content = JSON.stringify(body);
		response.writeHead(statusCode, {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
		});
		response.end(response.req?.method === 'HEAD' ? undefined : content);
	}

	private sendHtml(response: ServerResponse, statusCode: number, content: string): void {
		response.writeHead(statusCode, {
			'Cache-Control': 'no-store',
			'Content-Type': 'text/html; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
		});
		response.end(response.req?.method === 'HEAD' ? undefined : content);
	}

	private renderPage(): string {
		const instance = escapeHtml(this.options.instance);
		const version = escapeHtml(this.options.version);
		return `<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>ioBroker NextUI</title>
	<style>
		:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0b1020; color: #e8ecf7; }
		* { box-sizing: border-box; }
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.25rem; background: radial-gradient(circle at 10% 0%, #26366b, transparent 45%), #0b1020; }
		main { width: min(100%, 42rem); border: 1px solid #394675; border-radius: 1.5rem; padding: clamp(1.5rem, 6vw, 3rem); background: rgba(18, 26, 52, .9); box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, .3); }
		.badge { color: #9fb5ff; font-size: .8rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
		h1 { margin: .6rem 0 .75rem; font-size: clamp(2rem, 8vw, 3.5rem); line-height: 1; }
		.lead { color: #c1c9e2; font-size: 1.05rem; line-height: 1.6; }
		.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .75rem; margin-top: 2rem; }
		.card { padding: 1rem; border-radius: .9rem; background: #202d59; }
		.label { display: block; color: #aab6d8; font-size: .8rem; margin-bottom: .35rem; }
		.value { font-weight: 700; overflow-wrap: anywhere; }
		.status { color: #7df0b4; }
		footer { margin-top: 2rem; color: #8996bc; font-size: .85rem; }
	</style>
</head>
<body>
	<main>
		<div class="badge">ioBroker Adapter</div>
		<h1>ioBroker NextUI</h1>
		<p class="lead">Visualisierung befindet sich in Entwicklung</p>
		<section class="grid" aria-label="Serverinformationen">
			<div class="card"><span class="label">Adapterinstanz</span><span class="value">${instance}</span></div>
			<div class="card"><span class="label">Serverstatus</span><span class="value status">Online</span></div>
			<div class="card"><span class="label">Version</span><span class="value">${version}</span></div>
		</section>
		<footer>Die Grundlage für eine responsive ioBroker-Visualisierung.</footer>
	</main>
</body>
</html>`;
	}

	private describeError(error: NodeJS.ErrnoException): Error {
		if (error.code === 'EADDRINUSE') {
			return new Error(`Port ${this.options.port} auf ${this.options.bindAddress} ist bereits belegt.`);
		}
		if (error.code === 'EACCES') {
			return new Error(
				`Keine Berechtigung, den Port ${this.options.port} auf ${this.options.bindAddress} zu öffnen.`,
			);
		}
		return new Error(
			`HTTP-Server konnte auf ${this.options.bindAddress}:${this.options.port} nicht gestartet werden: ${error.message}`,
		);
	}
}

function escapeHtml(value: string): string {
	const entities: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		"'": '&#39;',
		'"': '&quot;',
	};
	return value.replace(/[&<>'"]/g, character => entities[character]);
}

function getContentType(filePath: string): string {
	const contentTypes: Record<string, string> = {
		'.css': 'text/css; charset=utf-8',
		'.html': 'text/html; charset=utf-8',
		'.ico': 'image/x-icon',
		'.js': 'text/javascript; charset=utf-8',
		'.json': 'application/json; charset=utf-8',
		'.png': 'image/png',
		'.svg': 'image/svg+xml',
		'.woff2': 'font/woff2',
	};
	return contentTypes[extname(filePath)] ?? 'application/octet-stream';
}

function parsePaginationParameter(value: string | null, name: string): number | undefined {
	if (value === null || value === '') {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new InvalidRequestError(`Invalid ${name} parameter.`);
	}
	return parsed;
}
