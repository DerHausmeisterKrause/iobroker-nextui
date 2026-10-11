import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatapointBrowser } from './datapoint-browser';

describe('DatapointBrowser', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('shows datapoints returned by the adapter API and searches them', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [item()], total: 1 }));
		vi.stubGlobal('fetch', fetchMock);
		const user = userEvent.setup();
		render(<DatapointBrowser />);
		await screen.findByText('Kitchen temperature');
		await user.type(screen.getByRole('textbox', { name: 'Datenpunkte suchen' }), 'kitchen');
		await waitFor(() =>
			expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('search=kitchen'), expect.anything()),
		);
	});

	it('shows an error when the development API is unavailable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
		render(<DatapointBrowser />);
		expect(await screen.findByRole('alert')).toHaveTextContent('nicht aktiviert');
	});

	it('shows an empty result message', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0 })));
		render(<DatapointBrowser />);
		expect(await screen.findByText('Keine Datenpunkte gefunden.')).toBeInTheDocument();
	});
});

function item(): {
	id: string;
	name: string;
	type: string;
	value: number;
	unit: string;
	readable: boolean;
	writable: boolean;
	ts: number;
} {
	return {
		id: 'test.0.temperature',
		name: 'Kitchen temperature',
		type: 'number',
		value: 21.5,
		unit: '°C',
		readable: true,
		writable: false,
		ts: 1,
	};
}

function jsonResponse(body: unknown): Response {
	return { ok: true, json: () => Promise.resolve(body) } as Response;
}
