# Development Roadmap

## Phase 1 - Foundation
- [x] Repository setup
- [x] ioBroker adapter scaffold
- [x] Frontend workspace, application shell, navigation, and theme foundation
- [x] Development environment
- [x] Basic server foundation and health endpoint
- [x] Webserver lifecycle and conflict tests
- [x] Basic CI and package artifacts
- [ ] Further test coverage and production readiness

## Phase 2 - Datapoints
- [x] ioBroker connection (read-only local development API)
- [x] Datapoint browser (read-only local development mode)
- Real-time subscriptions
- Read and write operations
- [x] First read-only per-datapoint binding (development mode; polling)
- [ ] Shared realtime binding engine (server-side subscriptions and permissions)

## Phase 3 - Visualization
- [x] Single server-persisted overview dashboard (instance-local, versioned)
- [ ] Multiple editable dashboard pages and per-user ACL
- Layout engine
- Widget registry
- [x] First read-only number, status and text widgets
- [ ] Extended widgets and cross-device persisted configuration
- Responsive interface

## Phase 4 - Editor
- Drag and drop
- Widget configuration
- Popups
- Templates
- Undo and redo

## Phase 5 - Advanced
- History charts
- Camera gateway
- HTML widgets
- Energy flow widgets
- [x] Initial single-password HTTP authentication (loopback + external HTTPS)
- [ ] ioBroker user integration and advanced ACL permissions

## Phase 6 - Professional
- Installers
- Backups
- Diagnostics
- Migration
- Release management
