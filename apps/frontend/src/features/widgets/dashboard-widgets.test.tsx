import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('read-only dashboard widgets', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('loads an allowlisted datapoint and renders its real number value', async () => {
		const mockFetch = vi.fn().mockImplementation((url: string) =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve(url.includes('/by-id?') ? { item: datapoint } : { items: [datapoint], total: 1 }),
			}),
		);
		vi.stubGlobal('fetch', mockFetch);
		const user = userEvent.setup();
		render(<DashboardWidgets />);
		await user.click(await screen.findByRole('button', { name: /Kitchen temperature/ }));
		await user.click(screen.getByRole('button', { name: 'Kachel hinzufügen' }));
		expect(await screen.findByText('21,5 °C')).toBeInTheDocument();
		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringContaining('/api/datapoints/by-id?id=safe.0.temperature'),
			expect.anything(),
		);
		const widget = screen.getByRole('group', { name: 'Kitchen temperature' });
		expect(within(widget).getByText('21,5 °C')).toBeInTheDocument();
		expect(window.localStorage.getItem('nextui-readonly-widgets-v1')).toContain('safe.0.temperature');
		await user.click(screen.getByRole('button', { name: 'Kachel Kitchen temperature entfernen' }));
		expect(screen.getByText('Noch keine Kacheln angelegt')).toBeInTheDocument();
	});

	it('displays an informative error if the developer API is disabled', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
		render(<DashboardWidgets />);
		expect(await screen.findByRole('alert')).toHaveTextContent('Entwicklungsmodus');
	});

	it('rejects invalid saved widgets and mismatching runtime data types', () => {
		const stored = JSON.stringify([
			{ id: 'a', title: 'Value', datapointId: 'safe.0.temperature', kind: 'number' },
			{ id: 'b', title: 'Invalid', datapointId: 'safe.0.temperature', kind: 'script' },
		]);
		expect(parseStoredWidgets(stored)).toHaveLength(1);
		expect(parseStoredWidgets('not json')).toEqual([]);
		expect(formatWidgetValue('boolean', { ...datapoint, type: 'boolean', value: true })).toEqual('Ein');
		expect(formatWidgetValue('boolean', datapoint)).toEqual('Datentyp passt nicht');
	});
});
