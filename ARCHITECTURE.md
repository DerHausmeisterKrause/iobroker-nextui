# Architecture

## Proposed Technology
- TypeScript
- React
- Vite
- Node.js
- ioBroker Adapter Core

## Components
- Adapter backend
- Web frontend
- Widget engine
- Binding engine
- Layout engine
- Authentication and authorization
- Media gateway
- History integration

## Principles
- Modular design
- Strict separation of backend and frontend
- Widgets must not depend on specific adapters
- Configuration must be portable
- Server-side security enforcement
- Multiple isolated adapter instances

## Open Decisions
- Monorepo structure
- Configuration storage
- Frontend API
- Authentication integration
- Camera streaming implementation
- Widget plugin architecture

Document important architecture decisions before
implementation.

## Foundation and future monorepo boundary

The repository root is currently the publishable `iobroker.nextui` adapter
package. Its ioBroker metadata, admin configuration, TypeScript source, and
compiled output stay together so the package can be installed by ioBroker
without an extra wrapper directory.

When the React frontend is introduced, it should be added as a separate
workspace application (for example `apps/frontend`). Cross-cutting contracts
and serializable models should live in workspace packages (for example
`packages/contracts`), while adapter-only runtime code remains in this
package. The frontend must communicate through an explicit adapter API and
must not import adapter internals or hardcode ioBroker datapoint IDs.

This keeps the current adapter scaffold usable on its own and leaves room for
a later npm-workspaces monorepo without putting frontend widgets into the
adapter foundation.

## HTTP API boundary

The adapter owns a small native Node.js HTTP server in `src/web-server.ts`.
The server lifecycle is tied to the ioBroker `ready` and `unload` events, and
each adapter instance has its own configured port. It binds to loopback by
default. The initial API is intentionally read-only: `GET /api/health` exposes
only instance, version, bind address, port, and running status.

The eventual React application should consume this boundary through shared
serializable contracts (for example in `packages/contracts`). Authentication,
authorization, sessions, and any state-changing API must be added before a
non-loopback deployment is considered safe.

### Datapoint development API

`GET /api/datapoints` is a separate, read-only development endpoint. It is
disabled by default and is only enabled when the instance's **local datapoint
development mode** is explicitly selected, the HTTP server is bound to a
loopback address, and at least one explicit datapoint ID pattern is allowlisted.
This is enforced by the adapter, not by the frontend. `common.read === false`
objects are excluded before any state value is read.

The endpoint returns a paginated, cached index of allowlisted `state` objects
and their current page values. It exposes only the ID, display name, supported
value type, unit, role, read/write flags, state timestamp, ack flag and value.
Adapter configuration, credentials and arbitrary objects are never serialized.
The object index is loaded only for configured patterns; state reads are limited
to the requested page and retained in a bounded short-lived cache. Object
invalidation and state-cache updates are available as the future subscription
boundary. No HTTP write endpoint exists.

Loopback is a network-boundary mitigation, not user authentication. A local
user, a compromised local process, or a reverse proxy/tunnel can still forward
requests. Do not expose this development mode through a proxy or use it for
production data until server-side authentication and authorization exist.

## Frontend workspace and delivery

`apps/frontend` is a separate React/Vite workspace. It contains the visual
shell, navigation, theme provider, reusable UI primitives, and an empty widget
registry, while adapter runtime code remains under `src`. A production build is
written to `www/frontend` and served by the adapter's own HTTP server.

Static-file resolution is constrained to that directory. Existing assets are
served directly, extensionless browser routes fall back to `index.html`, and
`/api/*` requests never fall back to the SPA. This keeps future adapter APIs
separate from browser navigation and avoids exposing files outside the frontend
build directory.
