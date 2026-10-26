/*
 * Created with @iobroker/create-adapter v3.1.5
 */

import * as utils from '@iobroker/adapter-core';
import { DatapointApi, parseAllowedPatterns, type DatapointAdapterApi } from './datapoint-api';
import { NextuiWebServer } from './web-server';
import { HttpAuthenticator } from './http-auth';
import { DashboardStore } from './dashboard-store';
import { DatapointLiveHub } from './datapoint-live-hub';

const DEFAULT_PORT = 8090;
const DEFAULT_BIND_ADDRESS = '127.0.0.1';

class Nextui extends utils.Adapter {
	private webServer: NextuiWebServer | undefined;
	private datapointApi: DatapointApi | undefined;
	private dashboardStore: DashboardStore | undefined;
	private liveHub: DatapointLiveHub | undefined;
	private objectSubscriptions: string[] = [];

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({ ...options, name: 'nextui' });
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		const port = this.getConfiguredPort();
		const bindAddress = this.config.bindAddress?.trim() || DEFAULT_BIND_ADDRESS;
		const instance = this.namespace ?? `nextui.${this.instance}`;
		if (!isLoopbackAddress(bindAddress)) {
			const message =
				'NextUI verweigert derzeit die unverschlüsselte LAN-Bindung. Bitte Loopback und einen HTTPS-Reverse-Proxy verwenden.';
			this.log.error(message);
			this.terminate(message, 1);
			return;
		}
		let authenticator: HttpAuthenticator | undefined;
		const uiPassword = this.config.uiPassword ?? '';
		if (uiPassword.length > 0) {
			try {
				authenticator = new HttpAuthenticator(uiPassword);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.log.error(`NextUI-Zugangsschutz: ${message}`);
				this.terminate(message, 1);
				return;
			}
		} else {
			this.log.warn(
				'NextUI läuft ohne Passwortschutz. Nur über lokalen SSH-Tunnel verwenden; nicht öffentlich weiterleiten.',
			);
		}
		const allowedPatterns = parseAllowedPatterns(this.config.datapointApiAllowedPatterns);
		const datapointApiEnabled =
			this.config.datapointApiDevelopmentMode === true &&
			isLoopbackAddress(bindAddress) &&
			allowedPatterns.length > 0;
		if (this.config.datapointApiDevelopmentMode === true && !datapointApiEnabled) {
			this.log.warn(
				'Der Datenpunkt-Entwicklungsmodus bleibt deaktiviert: Loopback-Bindung und mindestens ein erlaubtes ID-Muster sind erforderlich.',
			);
		}
		this.datapointApi = datapointApiEnabled
			? new DatapointApi(this as unknown as DatapointAdapterApi, allowedPatterns)
			: undefined;
		this.liveHub = this.datapointApi ? new DatapointLiveHub(this) : undefined;
		this.dashboardStore = authenticator
			? new DashboardStore({
					read: async () => {
						const stored = await this.getObjectAsync('dashboard');
						return stored?.native?.dashboard;
					},
					write: async document => {
						await this.setObjectAsync('dashboard', {
							type: 'channel',
							common: { name: 'NextUI Dashboard' },
							native: { dashboard: document },
						});
					},
				})
			: undefined;
		this.webServer = new NextuiWebServer({
			port,
			bindAddress,
			instance,
			version: this.version ?? '0.0.1',
			authenticator,
			dashboardStore: this.dashboardStore,
			datapointApi: this.datapointApi,
			datapointApiEnabled,
			liveHub: this.liveHub,
			onError: error => this.log.error(`HTTP-Serverfehler: ${error.message}`),
		});

		try {
			if (this.datapointApi) {
				for (const pattern of allowedPatterns) {
					await this.subscribeForeignObjectsAsync(pattern);
					this.objectSubscriptions.push(pattern);
				}
			}
			await this.webServer.start();
			this.log.info(`HTTP-Server für ${instance} läuft auf ${bindAddress}:${this.webServer.getStatus().port}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.log.error(`HTTP-Server konnte nicht gestartet werden: ${message}`);
			this.webServer = undefined;
			this.terminate(message, 1);
		}
	}

	private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
		this.datapointApi?.updateState(id, state ?? null);
		this.liveHub?.publish(id);
	}

	private onObjectChange(id: string): void {
		if (!this.datapointApi || !this.liveHub) {
			return;
		}
		this.datapointApi.invalidateObjects();
		this.liveHub.publish(id);
	}

	private getConfiguredPort(): number {
		const port = Number(this.config.port);
		if (Number.isInteger(port) && port >= 1 && port <= 65535) {
			return port;
		}
		this.log.warn(`Ungültiger HTTP-Port "${this.config.port}"; verwende ${DEFAULT_PORT}.`);
		return DEFAULT_PORT;
	}

	private onUnload(callback: () => void): void {
		const webServer = this.webServer;
		const hub = this.liveHub;
		const objectPatterns = this.objectSubscriptions.splice(0);
		this.webServer = undefined;
		this.liveHub = undefined;
		this.datapointApi = undefined;
		this.dashboardStore = undefined;
		void (async () => {
			if (webServer) {
				await webServer.stop();
			}
			if (hub) {
				await hub.close();
			}
			await Promise.allSettled(objectPatterns.map(pattern => this.unsubscribeForeignObjectsAsync(pattern)));
		})()
			.catch(error => this.log.error(`Fehler beim Beenden der Live-Abonnements: ${String(error)}`))
			.finally(callback);
	}
}

function isLoopbackAddress(address: string): boolean {
	return address === '127.0.0.1' || address === '::1' || address.toLocaleLowerCase() === 'localhost';
}
if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Nextui(options);
} else {
	(() => new Nextui())();
}
