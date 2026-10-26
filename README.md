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

## Webserver: HTTP oder HTTPS direkt im Adapter

NextUI bringt seinen eigenen Webserver mit. **Kein Reverse Proxy erforderlich.**
Unter den Instanzeinstellungen `nextui.0` lassen sich Port, Bind-Adresse,
Protokoll und Zertifikatsquelle konfigurieren. Standard: `127.0.0.1:8090`
per HTTP, sicherer Loopback-Modus.

### Direkter LAN-Zugriff

**Empfohlen (HTTPS):**
1. `Webserver-Protokoll: HTTPS` wählen.
2. `Bind-Adresse: 0.0.0.0` oder die konkrete ioBroker-LAN-IP eintragen.
3. HTTPS-Zertifikatsquelle wählen (siehe unten).
4. Ein **NextUI-Zugangspasswort mit mindestens 16 Zeichen** setzen.
5. Speichern, Adapter starten und `https://IOBROKER-IP:8090/` öffnen.

Falls du die ioBroker-Standardzertifikate verwendest, erscheint im Browser
voraussichtlich eine Zertifikatswarnung. Die ioBroker-Standardzertifikate sind
auf Installationen identisch und **nicht für sichere Identitätsprüfung
geeignet**; für sicheren produktiven LAN-Zugriff eigene Zertifikate verwenden.

**Ohne Zertifikat per HTTP (bewusster Testmodus):**
1. `Webserver-Protokoll: HTTP`, `Bind-Adresse: 0.0.0.0`.
2. `Unsicheres HTTP im LAN ausdrücklich erlauben` einschalten.
3. Speichern und unter `http://IOBROKER-IP:8090/` öffnen.

HTTP ist nicht verschlüsselt: **auch HTTP-Basic-Passwörter können abgefangen
werden**. Deshalb bleibt die Datenpunkt-API bei LAN-HTTP normalerweise aus.
Wer sie für ein isoliertes Testnetz dennoch benötigt, muss zusätzlich
`Datenpunkt-API auch über unsicheres HTTP-LAN erlauben` aktivieren, ein
NextUI-Zugangspasswort setzen, den Datenpunkt-Entwicklungsmodus aktivieren
und mindestens eine ausdrückliche Datenpunkt-Allowlist definieren.
Keine Internet-Portfreigabe; besser direkt HTTPS verwenden.

### HTTPS-Zertifikate

Unter `HTTPS-Zertifikatsquelle` gibt es vier Wege:

- **ioBroker-Zertifikatsspeicher:** Bestehendes öffentliches Zertifikat,
  Privatschlüssel und optionale Kette in der Admin-Konfiguration auswählen.
  Ohne eigene Auswahl werden die ioBroker-Standardzertifikate verwendet.
- **ioBroker-Zertifikatskollektion:** Die ID aus
  `system.certificates.native.collections` angeben (z. B. ACME).
- **PEM direkt einfügen:** Öffentlichen PEM-Zertifikatsblock und privaten
  PEM-Schlüssel in der Admin-Konfiguration hinterlegen. Der private
  Schlüssel wird über `encryptedNative` und `protectedNative` geschützt.
- **Manuell hochgeladene PEM-Dateien:** Zertifikat und Privatschlüssel
  beispielsweise per SFTP/SCP auf den ioBroker-Host übertragen und
  absolute Pfade konfigurieren. Den privaten Schlüssel **niemals** in den
  öffentlich auslieferbaren Web-Ordner legen. Die ioBroker-Dienstkennung
  benötigt Leserechte auf die Dateien; den Schlüssel restriktiv schützen.

Ein direkter Upload der privaten Schlüsseldatei über den NextUI-Admin-Dialog
ist in dieser Version noch nicht implementiert: Hierfür PEM-Inhalt einfügen
oder die Datei auf den Host übertragen. Die Zertifikate können auch im
ioBroker-Admin-Systemeinstellungsbereich importiert und danach ausgewählt
werden.

Ein HTTPS-Server benötigt immer ein Zertifikat, auch wenn es nur
selbstsigniert ist. Bei defekten/fehlenden oder nicht zusammenpassenden
Zertifikaten verweigert NextUI den HTTPS-Start, **statt auf HTTP
zurückzufallen**. TLS 1.2 oder neuer wird erzwungen.

### Lokaler Funktionstest

```bash
curl -i http://127.0.0.1:8090/api/health
ss -lntp | grep ':8090'
```

Bei HTTPS stattdessen `curl -k -i https://127.0.0.1:8090/api/health`
verwenden. `-k` ist **nur für selbstsignierte Testzertifikate**
gedacht. Bei aktiviertem Zugangsschutz muss ein gültiger Benutzer
(`nextui`) plus Passwort angegeben werden.

Für den lokalen HTTP-Betrieb ohne LAN-Freigabe kann ein SSH-Tunnel dienen:

```bash
ssh -N -L 8090:127.0.0.1:8090 USER@IOBROKER-IP
```

### Zugangsschutz und sensible APIs

Ein gesetztes NextUI-Passwort schützt sämtliche HTTP-Routen per HTTP Basic.
Benutzername: `nextui`, Mindestlänge: 16 Zeichen; Fehleingaben werden
rate-limitiert. **Nur HTTPS schützt das Passwort auf dem Transportweg.**
Dies ist noch keine ioBroker-Benutzerverwaltung.

Bei Loopback bleiben Datenpunkt-Entwicklungsmodus und Allowlist weiterhin
Pflicht. Über das LAN wird die Datenpunkt-API nur bei HTTPS **mit Passwort**
oder bei besonders freigegebenem unsicherem HTTP **mit Passwort**
aktiviert. Anonyme LAN-Browser erhalten keine ioBroker-Datenpunktwerte.
Servergespeicherte Dashboards benötigen ebenfalls Zugangsschutz und
unterliegen derselben LAN-Transportfreigabe. Bestehende CSRF-Prüfungen
bleiben erhalten.

## Datenpunktbrowser (lokale Entwicklung)

Der Bereich **Datenpunkte** im Frontend zeigt eine schreibgeschützte Suche über
ioBroker-`state`-Objekte. Damit keine Datenpunkte ohne Authentifizierung über
HTTP preisgegeben werden, ist die zugehörige API standardmäßig deaktiviert.
Für eine lokale Entwicklung muss in der Admin-Konfiguration ausdrücklich
`Lokalen Datenpunkt-Entwicklungsmodus aktivieren` gesetzt sein. Zusätzlich muss unter `Erlaubte Datenpunkt-ID-Muster` mindestens ein
explizites Muster konfiguriert werden, etwa `zigbee.0.*`. Im LAN benötigt
die API HTTPS mit Passwort oder die gesonderte bewusste Freigabe für HTTP-LAN
mit Passwort. Ohne Allowlist bleibt die API deaktiviert. Datenpunkte mit
`common.read: false` werden vollständig ausgeschlossen.

Nach einem Adapter-Neustart ist der Browser unter `/datenpunkte` verfügbar.
Er verwendet `GET /api/datapoints` mit Such-, Typfilter- und
Seitengrößenparametern. Die Schnittstelle liefert nur Werte und unkritische
Metadaten von `state`-Objekten; es gibt keine Schreiboperationen, keine
Adapter-Konfiguration und keine Zugangsdaten. Die Werte werden pro Ergebnisseite
abgerufen und nur kurz begrenzt gecacht. Loopback ersetzt keine Anmeldung:
lokale Prozesse sowie Reverse-Proxies oder Tunnel können Anfragen weiterleiten.
Den Entwicklungsmodus niemals ungeschützt ins Internet freigeben; die
weitere Benutzer- und Rechteverwaltung ist weiterhin in Entwicklung.

## Erste Widgets (lokale Entwicklung)

Die Übersichtsseite erlaubt jetzt das Hinzufügen schreibgeschützter Zahlen-, Status-
und Text-Kacheln. Zuerst muss der Datenpunkt-Entwicklungsmodus aktiviert, die
Transport und Authentifizierung gemäß den oben genannten LAN-Bedingungen
konfiguriert und ein explizites Datenpunkt-Muster erlaubt sein. In der Übersicht einen freigegebenen Datenpunkt suchen, auswählen,
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
Für das LAN wird direktes HTTPS mit NextUI-Authentifizierung empfohlen. Die lokale Entwicklungsmodus-Allowlist
bleibt weiterhin notwendig. Dies ersetzt noch keine individuellen Benutzerrechte.

## Servergespeicherte Dashboard-Kacheln

NextUI speichert die Kacheln der Übersichtsseite ab dieser Version pro
**Adapterinstanz** in der ioBroker-Objektdatenbank unter dem eigenen Objekt
`nextui.0.dashboard` (für weitere Instanzen entsprechend mit deren Namespace).
Die Konfiguration enthält nur Widget-ID, Titel, Datenpunkt-ID und Darstellung,
aber **keine** Passwörter, Tokens oder aktuellen Datenpunktwerte.

Für die Nutzung muss ein NextUI-Zugangspasswort von mindestens 16 Zeichen
in den Instanzeinstellungen gesetzt sein. Danach ist die Konfiguration über
`GET /api/dashboard` lesbar und über `PUT /api/dashboard` bearbeitbar.
Das Schreiben verlangt HTTP Basic Auth, eine gleichnamige Browser-Origin,
`Content-Type: application/json` und den Header `X-NextUI-Write: 1`.
Es gibt eine Begrenzung der Größe und der Kachelanzahl (12). Browser senden
die zuvor gelesene `revision`; bei abweichender Version liefert die API 409,
damit Änderungen aus mehreren Browsern nicht still überschrieben werden.
Die Bedienoberfläche bietet einen manuellen Knopf zum Neuladen.

Auf dem jeweiligen Browser vorhandene ältere LocalStorage-Kacheln werden
**nicht automatisch** überschrieben oder übertragen. Nur wenn das
serverseitige Dashboard leer ist, erscheint der Knopf
**Browser-Kacheln in ioBroker übernehmen**. Erst nach erfolgreicher Übernahme
werden die alten Browserdaten entfernt. Der Import wird nie automatisch
ausgeführt.

Die Datenpunktabfrage für Widgetwerte bleibt getrennt und erfordert weiterhin
den lokalen Datenpunkt-Entwicklungsmodus und passende Allowlist. Die
Serverablage ist momentan eine einzelne gemeinsame Übersichtsseite pro
Instanz; Benutzerberechtigungen und Mehrseiten-Editor folgen später.

## Live-Updates per Server-Sent Events (Entwicklungsmodus)

Widgets öffnen jetzt eine browserseitige Server-Sent-Events-Verbindung unter
`GET /api/datapoints/events?id=<exakte-id>`. Der Adapter abonniert die
betroffenen ioBroker-States erst bei einer aktiven Browser-Verbindung,
verteilt Änderungen direkt und gibt das Abonnement nach dem Trennen wieder
frei. Mehrere Browser teilen dieselben ioBroker-Abonnements.

SSE wird genauso wie der Datenpunktbrowser ausschließlich bei aktiviertem
lokalem Entwicklungsmodus mit expliziter Datenpunkt-Allowlist zugelassen.
`common.read === false` wird geprüft; Wildcards, unbekannte Datenpunkte,
leere oder doppelte IDs sind als Stream-Anfrage verboten. Maximal zwölf IDs
je Stream und 24 gleichzeitige Stream-Verbindungen je Instanz. Für die
Anzeige von Live-Daten gelten dieselben Sicherheitsgrenzen wie für
`/api/datapoints` und `/api/datapoints/by-id`.

Widget-Kacheln nutzen die Ereignisse sofort. Nach Verbindungsverlust erfolgt
ein Rückfall auf zehnsekündiges Polling; später wird SSE erneut probiert.
Diese Implementierung ist **kein** Ersatz für die kommende
benutzerbezogene ACL- und Produktionsauthentifizierung. Für die Vorschau
nur Loopback, SSH-Tunnel oder entsprechend abgesicherten lokalen Zugriff
verwenden. Die Dashboard-Konfiguration wird weiterhin über die separate
Dashboard-API gespeichert.

## Keine Datenpunktwerte sichtbar? (NextUI-Diagnose)

Die Login-Anmeldung ist unabhängig vom ioBroker-Datenpunktzugriff. NextUI
benötigt eine freigegebene Datenpunkt-API, damit die Widget-Kacheln Werte
anzeigen. Ab dieser Version meldet `GET /api/health` unter
`features.datapoints.enabled`, ob die API aktiv ist, und erklärt bei
Deaktivierung den Grund unter `features.datapoints.hint` (keine
Passwörter/Zertifikate oder rohen Objekte). Dashboard und Datenpunktbrowser
zeigen eine entsprechende Warnung.

Für **HTTPS im LAN** in `nextui.0` einstellen:

- HTTPS mit einem geeigneten Zertifikat und LAN-Bind-Adresse
- NextUI-Zugangspasswort (mindestens 16 Zeichen)
- `Schreibgeschützte Datenpunkt-API aktivieren (Entwicklungsmodus)`
- `Erlaubte Datenpunkt-ID-Muster` passend zu echten IDs, beispielsweise
  `0_userdata.0.*` oder `zigbee.0.*`

Danach die Instanz neu starten. Test im angemeldeten Browser:
`https://IOBROKER-IP:8090/api/health` und
`https://IOBROKER-IP:8090/api/datapoints?limit=5`.
HTTP 403 bedeutet gesperrte API; HTTP 200 mit leerer Liste deutet auf
nicht passende Allowlist oder noch fehlende State-Objekte hin. HTTP 200
mit `items`, deren `value` gleich `null` ist, bedeutet, dass zum Objekt
gerade kein State-Wert verfügbar ist. Datenpunkte mit `common.read === false`
sind absichtlich nicht lesbar.

Beim **HTTP-LAN-Testmodus** sind zusätzlich die beiden Warn-Freigaben
(`Unsicheres HTTP im LAN` und `Datenpunkt-API auch über unsicheres
HTTP-LAN`) erforderlich. HTTP Basic gibt Zugangsdaten unverschlüsselt
weiter; für den regulären Einsatz HTTPS verwenden.

## Visueller Dashboard-Editor (erste Ausbaustufe)

Auf der Übersichtsseite `Dashboard bearbeiten` auswählen. Kacheln
über den Ziehgriff umordnen oder mit den Hoch/Runter-Schaltflächen
verschieben. Über `Bearbeiten` können Titel, Datenpunkt-ID, Darstellung
und Breite (1/2/3 Spalten) geändert werden. Auf Tablets und Smartphones
steht die Schaltflächen-Navigation als Alternative zu Drag-and-drop bereit.
Die Breite ist responsive und entspricht auf kleinen Bildschirmen dem
vorhandenen Spaltenraster.

Die Reihenfolge und Breiten werden über die bereits vorhandene
authentifizierte `PUT /api/dashboard`-API mit Revisionsprüfung im
ioBroker-Objektspeicher persistiert. Bei konkurrierenden Änderungen wird
nicht automatisch überschrieben. Bereits gespeicherte Dashboards
ohne Breitenangaben bleiben gültig (Standardbreite 1).
Das Bearbeiten von Datenpunkt-IDs aktiviert keinen ioBroker-Schreibzugriff:
gesperrte oder nicht freigegebene IDs liefern weiterhin keine Werte.

Dies ist die erste Editor-Ausbaustufe; frei skalierbare Raster,
Mehrseiten-Dashboards und Benutzer-ACLs sind separate nächste Schritte.
