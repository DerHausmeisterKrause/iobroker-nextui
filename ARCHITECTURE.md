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
