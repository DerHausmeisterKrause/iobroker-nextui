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
`127.0.0.1`. Eine unverschlüsselte LAN-Bindung wird aus Sicherheitsgründen beim Start
verweigert. Verwende für den Browserzugriff von anderen Geräten einen
HTTPS-Reverse-Proxy vor dem lokalen NextUI-Server.

Die Startseite zeigt den aktuellen Adapterstatus. Für künftige Frontend-
Kommunikation gibt es bereits den schreibgeschützten Endpunkt `GET /api/health`.
Er liefert ausschließlich unkritische Statusdaten. Es gibt derzeit keine
ioBroker-Schreibfunktionen über HTTP. Ein einfacher passwortgeschützter HTTP-Basic-Zugang ist verfügbar;
Benutzerverwaltung und individuelle Berechtigungen sind noch nicht umgesetzt.

Die Webserver-Tests können mit `npm test` ausgeführt werden. Der vollständige
Qualitätscheck ist:

```bash
npm run build
npm run check
npm run lint
npm test
```

## Erste Inbetriebnahme / Weboberfläche öffnen

Nach Installation des aus GitHub Actions geladenen `.tgz`-Pakets muss eine
Adapterinstanz (z. B. `nextui.0`) angelegt und gestartet sein. Die Webseite
wird vom **eigenen** HTTP-Server des NextUI-Adapters ausgeliefert, nicht
innerhalb der ioBroker-Admin-Oberfläche.

Standardmäßig läuft NextUI auf **127.0.0.1:8090** auf dem ioBroker-Host.
Für den ersten Test auf diesem Host:

```bash
curl -i http://127.0.0.1:8090/api/health
curl -I http://127.0.0.1:8090/
ss -lntp | grep ':8090'
```

Zeigt `/api/health` den HTTP-Status 200 und `status: ok`, ist der
NextUI-Webserver erreichbar. Für die Anzeige im Browser auf einem **anderen**
Computer ist ein SSH-Tunnel die sicherere Lösung:

```bash
ssh -N -L 8090:127.0.0.1:8090 USER@IOBROKER-IP
```

Anschließend im lokalen Browser `http://127.0.0.1:8090/` öffnen. Die
Datenpunkt-Ansicht liegt unter `http://127.0.0.1:8090/datenpunkte`.

Für Zugriff von weiteren Geräten im LAN muss ein eigener HTTPS-Reverse-Proxy
vor NextUI eingerichtet werden; eine direkte unverschlüsselte LAN-Bindung wird
inzwischen verweigert. Näheres unter **Zugangsschutz und HTTPS-Vorbereitung**.

Bei `Connection refused` den Adapterstatus, den Adapter-Log, Portkonflikte
und den Listen-Socket kontrollieren. Bei `403` auf `/api/datapoints`
den ausdrücklich lokalen Entwicklungsmodus sowie die erlaubten ID-Muster
prüfen. Der Frontend-Einstieg `/` braucht diesen Modus nicht.

## Zugangsschutz und HTTPS-Vorbereitung (Entwicklungsfassung)

In den Einstellungen von `nextui.0` kann ein eigenes
**NextUI-Zugangspasswort (mindestens 16 Zeichen)** hinterlegt werden.
Der Benutzername für die erste Implementierung ist fest `nextui`.
Das Passwort wird über die ioBroker-Mechanismen
`encryptedNative` und `protectedNative` geschützt. Nach dem Speichern
die Adapterinstanz neu starten.

Sobald ein Passwort gesetzt ist, erfordert **jede HTTP-Anfrage**
(Frontend, statische Dateien und sämtliche APIs) HTTP Basic Auth. Browser
zeigen dafür eine eigene Anmeldemaske. Nach fünf erfolglosen Versuchen
eines Clients wird die weitere Anmeldung vorübergehend blockiert.

**Wichtig:** HTTP Basic Auth allein verschlüsselt keine Passwörter.
Es darf deshalb nur über einen SSH-Tunnel oder mit TLS-Terminierung
an einem HTTPS-Reverse-Proxy verwendet werden. Die NextUI-Instanz bleibt
dabei auf `127.0.0.1:8090` gebunden. Eine direkte Bind-Adresse im LAN
(z. B. `0.0.0.0`) wird derzeit beim Start aus Sicherheitsgründen
verweigert. Ohne gesetztes Passwort ist ausschließlich die lokale
Entwicklung über einen vertraulichen SSH-Tunnel geeignet.

Beispiel für einen **separat abgesicherten Nginx-HTTPS-VHost**
auf **demselben Host** wie NextUI. Die Zertifikate müssen bereits
gültig und auf den Geräten vertrauenswürdig sein:

```nginx
server {
    listen 443 ssl;
    server_name nextui.example.lan;

    ssl_certificate     /etc/ssl/nextui/fullchain.pem;
    ssl_certificate_key /etc/ssl/nextui/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 30s;
    }
}
```

Ein HSTS-Header sollte erst aktiviert werden, wenn der HTTPS-Zugriff
dauerhaft und zuverlässig funktioniert. Keine Portweiterleitung vom
Internet ohne weiteren Sicherheitsreview. Die Zugangsdaten sind
**keine ioBroker-Benutzeranmeldung**, und es gibt noch keine
individuellen ACLs oder Mehrbenutzerverwaltung. Die Datenpunkt-Allowlist
und der lokale Entwicklungsmodus bleiben zusätzlich zwingend erforderlich.
Der Basic-Zugang allein aktiviert keine Datenpunkt-API.

## Datenpunktbrowser (lokale Entwicklung)

Der Bereich **Datenpunkte** im Frontend zeigt eine schreibgeschützte Suche über
ioBroker-`state`-Objekte. Damit keine Datenpunkte ohne Authentifizierung über
HTTP preisgegeben werden, ist die zugehörige API standardmäßig deaktiviert.
Für eine lokale Entwicklung muss in der Admin-Konfiguration ausdrücklich
`Lokalen Datenpunkt-Entwicklungsmodus aktivieren` gesetzt sein. Zusätzlich
muss die Bind-Adresse eine Loopback-Adresse (`127.0.0.1`, `::1` oder
`localhost`) bleiben und unter `Erlaubte Datenpunkt-ID-Muster` mindestens ein
explizites Muster konfiguriert werden, etwa `zigbee.0.*`. Ohne Allowlist bleibt
die API deaktiviert. Bei einer LAN-Bindung verweigert der Adapter die API auch
dann, wenn der Schalter gesetzt ist. Datenpunkte mit `common.read: false`
werden vollständig ausgeschlossen.

Nach einem Adapter-Neustart ist der Browser unter `/datenpunkte` verfügbar.
Er verwendet `GET /api/datapoints` mit Such-, Typfilter- und
Seitengrößenparametern. Die Schnittstelle liefert nur Werte und unkritische
Metadaten von `state`-Objekten; es gibt keine Schreiboperationen, keine
Adapter-Konfiguration und keine Zugangsdaten. Die Werte werden pro Ergebnisseite
abgerufen und nur kurz begrenzt gecacht. Loopback ersetzt keine Anmeldung:
lokale Prozesse sowie Reverse-Proxies oder Tunnel können Anfragen weiterleiten.
Der Entwicklungsmodus darf deshalb nicht über einen Proxy veröffentlicht
werden. Für LAN-Zugriff oder den Produktionseinsatz sind zuerst serverseitige
Authentifizierung und Berechtigungen erforderlich.

## Erste Widgets (lokale Entwicklung)

Die Übersichtsseite erlaubt jetzt das Hinzufügen schreibgeschützter Zahlen-, Status-
und Text-Kacheln. Zuerst muss der Datenpunkt-Entwicklungsmodus aktiviert, die
**Bind-Adresse auf 127.0.0.1** belassen und ein explizites Datenpunkt-Muster
erlaubt sein. Über den SSH-Tunnel kann die Oberfläche im Browser geöffnet
werden. In der Übersicht einen freigegebenen Datenpunkt suchen, auswählen,
Darstellung wählen und die Kachel hinzufügen.

Für einzelne Widgetwerte nutzt NextUI `GET /api/datapoints/by-id?id=...`.
Der Endpunkt prüft dieselbe Allowlist und `common.read` wie der Browser.
Widgets aktualisieren sich vorerst alle 10 Sekunden; die Widget-Konfiguration
wird **nur im lokalen Browser-Speicher** gespeichert und enthält ausschließlich
Titel, Darstellung und Datenpunkt-ID (keine Zustandswerte). Sie wird nicht mit
anderen Geräten oder Benutzern synchronisiert. Eine spätere serverseitige,
berechtigungsgesicherte Visualisierungskonfiguration und Push-Abonnements sind
noch nicht implementiert. Noch **keine Schreibbefehle**.

Die Widget-API ist ausschließlich für einen lokalen Entwicklungsaufbau gedacht.
Sie darf nur hinter einem vertraulichen HTTPS-Reverse-Proxy **mit aktivierter
NextUI-Authentifizierung** genutzt werden. Die lokale Entwicklungsmodus-Allowlist
bleibt weiterhin notwendig. Dies ersetzt noch keine individuellen Benutzerrechte.
