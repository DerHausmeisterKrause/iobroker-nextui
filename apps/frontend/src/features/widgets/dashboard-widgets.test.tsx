import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardWidgets, formatWidgetValue, parseStoredWidgets } from './dashboard-widgets';

const datapoint = {
	id: 'safe.0.temperature',
	name: 'Kitchen temperature',
	type: 'number' as const,
	value: 21.5,
	unit: '°C',
	ts: 123,
};

function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

describe('server-persisted dashboard widgets', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('loads and saves widgets on the server and displays real datapoint values', async () => {
		let revision = 0;
		let widgets: unknown[] = [];
		const mockFetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
			if (url === '/api/dashboard' && options?.method === 'PUT') {
				const body = JSON.parse(options.body as string) as { expectedRevision: number; widgets: unknown[] };
				expect(body.expectedRevision).to.equal(revision);
				expect(options.headers).toMatchObject({ 'X-NextUI-Write': '1' });
				revision++;
				widgets = body.widgets;
				return Promise.resolve(jsonResponse({ revision, widgets }));
			}
			if (url === '/api/dashboard') {
				return Promise.resolve(jsonResponse({ revision, widgets }));
			}
			if (url.includes('/by-id?')) {
				return Promise.resolve(jsonResponse({ item: datapoint }));
			}
			return Promise.resolve(jsonResponse({ items: [datapoint], total: 1 }));
		});
		vi.stubGlobal('fetch', mockFetch);
		const user = userEvent.setup();
		render(<DashboardWidgets />);
		await user.click(await screen.findByRole('button', { name: /Kitchen temperature/ }));
		await user.click(screen.getByRole('button', { name: 'Kachel hinzufügen' }));
		expect(await screen.findByText('21,5 °C')).toBeInTheDocument();
		const widget = screen.getByRole('group', { name: 'Kitchen temperature' });
		expect(within(widget).getByText('21,5 °C')).toBeInTheDocument();
		expect(widgets).toHaveLength(1);
		await user.click(screen.getByRole('button', { name: 'Kachel Kitchen temperature entfernen' }));
		await waitFor(() => expect(widgets).toHaveLength(0));
		expect(revision).toBe(2);
		expect(window.localStorage.getItem('nextui-readonly-widgets-v1')).toBeNull();
	});

	it('explains when server-side storage requires a password', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403)));
		render(<DashboardWidgets />);
		expect(await screen.findByRole('alert')).toHaveTextContent('Zugangspasswort');
		expect(screen.getByRole('button', { name: 'Kachel hinzufügen' })).toBeDisabled();
	});

	it('offers explicit migration of old browser widgets without overwriting a server dashboard', async () => {
		window.localStorage.setItem(
			'nextui-readonly-widgets-v1',
			JSON.stringify([{ id: 'old', title: 'Alt', datapointId: datapoint.id, kind: 'number' }]),
		);
		let serverDocument = { revision: 0, widgets: [] as unknown[] };
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation((url: string, options?: RequestInit) => {
				if (url === '/api/dashboard' && options?.method === 'PUT') {
					const body = JSON.parse(options.body as string) as { widgets: unknown[] };
					serverDocument = { revision: 1, widgets: body.widgets };
					return Promise.resolve(jsonResponse(serverDocument));
				}
				if (url === '/api/dashboard') {
					return Promise.resolve(jsonResponse(serverDocument));
				}
				if (url.includes('/by-id?')) {
					return Promise.resolve(jsonResponse({ item: datapoint }));
				}
				return Promise.resolve(jsonResponse({ items: [], total: 0 }));
			}),
		);
		const user = userEvent.setup();
		render(<DashboardWidgets />);
		const importButton = await screen.findByRole('button', { name: 'Browser-Kacheln in ioBroker übernehmen' });
		expect(serverDocument.widgets).toHaveLength(0);
		await user.click(importButton);
		expect(await screen.findByText('21,5 °C')).toBeInTheDocument();
		expect(serverDocument.widgets).toHaveLength(1);
		expect(window.localStorage.getItem('nextui-readonly-widgets-v1')).toBeNull();
	});

	it('validates legacy widgets and refuses mismatching displayed data', () => {
		const raw = JSON.stringify([
			{ id: 'a', title: 'Value', datapointId: 'safe.0.temperature', kind: 'number' },
			{ id: 'b', title: 'Invalid', datapointId: 'safe.0.temperature', kind: 'script' },
		]);
		expect(parseStoredWidgets(raw)).toHaveLength(1);
		expect(parseStoredWidgets('not json')).toEqual([]);
		expect(formatWidgetValue('boolean', { ...datapoint, type: 'boolean', value: true })).toEqual('Ein');
		expect(formatWidgetValue('boolean', datapoint)).toEqual('Datentyp passt nicht');
	});
});
