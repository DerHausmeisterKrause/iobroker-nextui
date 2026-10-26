import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface FeatureHealth {
	features?: {
		datapoints?: { enabled: boolean; hint?: string };
		dashboard?: { enabled: boolean };
	};
}

export function DatapointApiNotice(): JSX.Element | null {
	const [status, setStatus] = useState<FeatureHealth['features']>();

	useEffect(() => {
		const controller = new AbortController();
		void fetch('/api/health', { cache: 'no-store', signal: controller.signal })
			.then(async response => response.ok ? await response.json() as FeatureHealth : undefined)
			.then(health => {
				if (!controller.signal.aborted) {
					setStatus(health?.features);
				}
			})
			.catch(() => undefined);
		return () => controller.abort();
	}, []);

	if (!status?.datapoints || status.datapoints.enabled) {
		return null;
	}

	return (
		<div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
			<AlertTriangle className="mt-0.5 shrink-0" size={19} />
			<div className="space-y-1">
				<p className="font-bold">Datenpunktzugriff ist deaktiviert</p>
				<p>{status.datapoints.hint || 'Bitte die NextUI-Instanzeinstellungen überprüfen.'}</p>
				<p className="text-xs">Für HTTPS im LAN: Zugangspasswort, Entwicklungsmodus und passende Datenpunkt-ID-Muster konfigurieren. Nach dem Speichern die Instanz neu starten.</p>
			</div>
		</div>
	);
}

