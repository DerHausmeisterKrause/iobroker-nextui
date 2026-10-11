# ioBroker NextUI

Modern, flexible, responsive visualization platform
for ioBroker.

## Goals

- Easy to use without programming
- Fully customizable widgets
- Any ioBroker datapoint can be used
- Responsive on all devices
- Runs locally as an ioBroker adapter
- Multiple independent adapter instances
- Multi-user support and access control
- Professional use by electrical installers

## Status

Early development.

## Development

The repository root is the `iobroker.nextui` adapter package. The initial
scaffold was generated with the official `@iobroker/create-adapter` template
using TypeScript, the JSON admin UI, ESLint, Prettier, and the local
ioBroker dev-server.

Install dependencies and run the checks with:

```bash
npm install
npm run build
npm run check
npm run lint
npm test
```

For the first local setup and subsequent adapter development:

```bash
npm run dev-server -- setup
npm run dev-server -- watch default
```

Run `setup` only once per local dev-server profile. The watch command builds
the adapter, starts the local ioBroker/Admin installation, and reloads the
adapter after source changes.

The adapter source starts in `src/main.ts`. Widgets and an editor are not part
of the current foundation yet.

## Frontend

Das React-Frontend liegt als eigenständige Workspace-Anwendung in
`apps/frontend`. Es verwendet Vite, TypeScript, Tailwind CSS, Radix-basierte
UI-Bausteine, Lucide-Icons und React Router. Die Navigation bleibt dabei im
jeweiligen Browser-Tab; es werden keine Navigationsdaten in ioBroker-Zustände
geschrieben.

Für die lokale Frontend-Entwicklung:

```bash
npm run frontend:dev
```

Für einen produktionsnahen Build und die Auslieferung durch den Adapter:

```bash
npm run build
```

Vite schreibt die Dateien nach `www/frontend`. Der HTTP-Server liefert diese
Dateien aus, bedient Client-Routen über den SPA-Fallback und hält `/api/*`
außerhalb dieses Fallbacks. Nach dem Start des Adapters ist das Frontend unter
`http://127.0.0.1:8090/` (oder dem konfigurierten Adapter-Port) erreichbar.

## HTTP-Webserver

Beim Start des Adapters wird ein eigener HTTP-Webserver gestartet. Der
Standardport ist `8090`; Port und Bind-Adresse lassen sich pro Adapterinstanz
in der Admin-Konfiguration einstellen. Standardmäßig bindet der Server nur an
`127.0.0.1`. Eine LAN-Freigabe muss ausdrücklich über `Bind-Adresse` gewählt
werden und sollte erst nach einer späteren Authentifizierung aktiviert werden.

Die Startseite zeigt den aktuellen Adapterstatus. Für künftige Frontend-
Kommunikation gibt es bereits den schreibgeschützten Endpunkt `GET /api/health`.
Er liefert ausschließlich unkritische Statusdaten. Es gibt derzeit keine
ioBroker-Schreibfunktionen über HTTP. Authentifizierung, Berechtigungen und
Benutzerverwaltung bleiben für eine spätere API-Ausbaustufe reserviert.

Die Webserver-Tests können mit `npm test` ausgeführt werden. Der vollständige
Qualitätscheck ist:

```bash
npm run build
npm run check
npm run lint
npm test
```
