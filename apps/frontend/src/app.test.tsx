import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { ThemeProvider } from './components/theme-provider';

function renderApp(initialEntry = '/'): void {
	render(
		<ThemeProvider>
			<MemoryRouter initialEntries={[initialEntry]}>
				<App />
			</MemoryRouter>
		</ThemeProvider>,
	);
}

describe('NextUI frontend shell', () => {
	it('renders the responsive navigation structure', () => {
		renderApp();
		expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
		expect(screen.getAllByRole('link', { name: 'Übersicht' })).not.toHaveLength(0);
		expect(screen.getAllByRole('link', { name: 'Einstellungen' })).not.toHaveLength(0);
		expect(screen.getByLabelText('Navigation öffnen')).toBeInTheDocument();
	});

	it('navigates within the current browser session', async () => {
		const user = userEvent.setup();
		renderApp();
		await user.click(screen.getAllByRole('link', { name: 'Energie' })[0]);
		expect(screen.getByRole('heading', { name: 'Energie', level: 2 })).toBeInTheDocument();
		expect(screen.getByText(/Energieflüsse und Historien/)).toBeInTheDocument();
	});
});
