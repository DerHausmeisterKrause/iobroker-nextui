# Instructions for Codex

You are developing ioBroker NextUI.

## General Rules
- Read REQUIREMENTS.md and ARCHITECTURE.md.
- Follow existing architecture and conventions.
- Do not introduce unnecessary dependencies.
- Keep modules small and maintainable.
- Use TypeScript with strict type checking.
- Prefer existing ioBroker APIs and libraries.

## Critical Principles
- Never force automatic device classification.
- All widgets must support configurable bindings.
- Do not hardcode ioBroker datapoint IDs.
- Keep browser navigation session-independent.
- Enforce permissions server-side.
- Never expose camera credentials to browsers.
- Support multiple independent adapter instances.
- Do not rely on external cloud services.

## Quality
- Add tests for new logic.
- Run available tests after changes.
- Run type checking and linting.
- Document architectural changes.
- Do not hide errors or silently ignore failures.

## Workflow
- Work on one clearly defined task at a time.
- Explain the planned changes briefly.
- Do not rewrite unrelated modules.
- Never commit credentials or secrets.
- Keep changes reviewable.
- Never deploy to production automatically.