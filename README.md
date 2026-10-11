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

The adapter source starts in `src/main.ts`. Widgets and the future React
frontend are intentionally not part of this foundation yet.
