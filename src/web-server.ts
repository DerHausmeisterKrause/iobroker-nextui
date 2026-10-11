import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export interface WebServerOptions {
	port: number;
	bindAddress: string;
	instance: string;
	version: string;
	frontendDirectory?: string;
	onError?: (error: Error) => void;
}

export interface WebServerStatus {
	running: boolean;
	port: number;
	bindAddress: string;
	instance: string;
	version: string;
}

type LifecycleOperation = () => Promise<void>;

export class NextuiWebServer {
	private server: Server | undefined;
	private listeningPort: number | undefined;
	private lifecycle: Promise<void> = Promise.resolve();

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
		};
	}

	private enqueue(operation: LifecycleOperation): Promise<void> {
		const next = this.lifecycle.then(operation, operation);
		this.lifecycle = next.catch(() => undefined);
		return next;
	}

	private startServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((request, response) => {
				void this.handleRequest(request, response).catch(error => {
					this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
					if (!response.headersSent) {
						this.sendJson(response, 500, { error: 'Internal server error' });
					}
				});
			});
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
		const requestUrl = new URL(request.url ?? '/', 'http://localhost');
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			this.sendJson(response, 405, { error: 'Method not allowed' });
			return;
		}

		if (requestUrl.pathname === '/api/health') {
			this.sendJson(response, 200, { status: 'ok', server: this.getStatus() });
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

	private async serveFrontendFile(
		pathname: string,
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<boolean> {
		const frontendDirectory = resolve(this.options.frontendDirectory ?? resolve(__dirname, '../www/frontend'));
		const decodedPath = decodeURIComponent(pathname);
		if (decodedPath.includes('\0')) {
			return false;
		}

		const relativePath = decodedPath.replace(/^\/+/, '');
		const requestedFile = this.safeFrontendPath(frontendDirectory, relativePath || 'index.html');
		if (requestedFile && (await this.sendFile(requestedFile, request, response))) {
			return true;
		}

		if (pathname === '/' || extname(relativePath) === '') {
			const indexFile = this.safeFrontendPath(frontendDirectory, 'index.html');
			if (indexFile) {
				return this.sendFile(indexFile, request, response);
			}
		}
		return false;
	}

	private safeFrontendPath(frontendDirectory: string, relativePath: string): string | undefined {
		const filePath = resolve(frontendDirectory, relativePath);
		return filePath.startsWith(`${frontendDirectory}${sep}`) ? filePath : undefined;
	}

	private async sendFile(filePath: string, request: IncomingMessage, response: ServerResponse): Promise<boolean> {
		try {
			const content = await readFile(filePath);
			response.writeHead(200, {
				'Cache-Control': 'no-store',
				'Content-Type': getContentType(filePath),
				'X-Content-Type-Options': 'nosniff',
			});
			response.end(request.method === 'HEAD' ? undefined : content);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return false;
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
		'.svg': 'image/svg+xml',
		'.woff2': 'font/woff2',
	};
	return contentTypes[extname(filePath)] ?? 'application/octet-stream';
}
