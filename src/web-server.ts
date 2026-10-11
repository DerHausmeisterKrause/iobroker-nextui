/* eslint-disable jsdoc/no-blank-blocks */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 *
 */
export interface WebServerOptions {
	/**
	 *
	 */
	port: number;
	/**
	 *
	 */
	bindAddress: string;
	/**
	 *
	 */
	instance: string;
	/**
	 *
	 */
	version: string;
}

/**
 *
 */
export interface WebServerStatus {
	/**
	 *
	 */
	running: boolean;
	/**
	 *
	 */
	port: number;
	/**
	 *
	 */
	bindAddress: string;
	/**
	 *
	 */
	instance: string;
	/**
	 *
	 */
	version: string;
}

/**
 *
 */
export class NextuiWebServer {
	private server: Server | undefined;
	private listeningPort: number | undefined;

	/**
	 *
	 */
	public constructor(private readonly options: WebServerOptions) {}

	/**
	 *
	 */
	public start(): Promise<void> {
		if (this.server) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			const server = createServer((request, response) => this.handleRequest(request, response));
			let settled = false;

			const onError = (error: NodeJS.ErrnoException): void => {
				if (settled) {
					return;
				}
				settled = true;
				this.server = undefined;
				reject(this.describeStartError(error));
			};

			server.once('error', onError);
			server.listen(this.options.port, this.options.bindAddress, () => {
				if (settled) {
					return;
				}
				settled = true;
				server.removeListener('error', onError);
				this.server = server;
				const address = server.address();
				this.listeningPort = typeof address === 'object' && address ? address.port : this.options.port;
				resolve();
			});
		});
	}

	/**
	 *
	 */
	public stop(): Promise<void> {
		const server = this.server;
		if (!server) {
			return Promise.resolve();
		}

		this.server = undefined;
		this.listeningPort = undefined;
		server.closeAllConnections?.();
		return new Promise(resolve => {
			server.close(() => resolve());
		});
	}

	/**
	 *
	 */
	public getStatus(): WebServerStatus {
		return {
			running: this.server !== undefined,
			port: this.listeningPort ?? this.options.port,
			bindAddress: this.options.bindAddress,
			instance: this.options.instance,
			version: this.options.version,
		};
	}

	private handleRequest(request: IncomingMessage, response: ServerResponse): void {
		const requestUrl = new URL(request.url ?? '/', 'http://localhost');
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			this.sendJson(response, 405, { error: 'Method not allowed' });
			return;
		}

		if (requestUrl.pathname === '/api/health') {
			this.sendJson(response, 200, {
				status: 'ok',
				server: this.getStatus(),
			});
			return;
		}

		if (requestUrl.pathname === '/') {
			this.sendHtml(response, 200, this.renderPage());
			return;
		}

		this.sendJson(response, 404, { error: 'Not found' });
	}

	private sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
		const content = JSON.stringify(body);
		response.writeHead(statusCode, {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
		});
		if (response.req?.method !== 'HEAD') {
			response.end(content);
		} else {
			response.end();
		}
	}

	private sendHtml(response: ServerResponse, statusCode: number, content: string): void {
		response.writeHead(statusCode, {
			'Cache-Control': 'no-store',
			'Content-Type': 'text/html; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
		});
		if (response.req?.method !== 'HEAD') {
			response.end(content);
		} else {
			response.end();
		}
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

	private describeStartError(error: NodeJS.ErrnoException): Error {
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
	return value.replace(/[&<>'"]/g, character => {
		const entities: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			"'": '&#39;',
			'"': '&quot;',
		};
		return entities[character];
	});
}
