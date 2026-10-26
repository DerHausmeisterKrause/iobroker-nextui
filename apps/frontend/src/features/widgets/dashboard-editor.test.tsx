import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reorderWidgets, updateWidget, WidgetLayout } from './dashboard-editor';
import type { DashboardWidgetConfig } from './dashboard-widgets';

const widgets: DashboardWidgetConfig[] = [
	{ id: 'a', title: 'Solar', datapointId: 'safe.0.solar', kind: 'number' },
	{ id: 'b', title: 'Licht', datapointId: 'safe.0.light', kind: 'boolean' },
	{ id: 'c', title: 'Status', datapointId: 'safe.0.status', kind: 'text' },
];

afterEach(cleanup);

describe('dashboard layout editor', () => {
	it('reorders by id while preserving all widget references and widths', () => {
		const updated = reorderWidgets(widgets, 'a', 'c');
		expect(updated.map(widget => widget.id)).toEqual(['b', 'c', 'a']);
		expect(reorderWidgets(widgets, 'missing', 'a')).toBe(widgets);
		expect(widgets.map(widget => widget.id)).toEqual(['a', 'b', 'c']);
	});

	it('updates only the selected widget properties without dropping another widget', () => {
		const updated = updateWidget(widgets, 'b', {
			title: 'Neue Lampe', datapointId: 'safe.0.new', kind: 'number', span: 2,
		});
		expect(updated[0]).toEqual(widgets[0]);
		expect(updated[1]).toMatchObject({ id: 'b', title: 'Neue Lampe', span: 2, datapointId: 'safe.0.new' });
		expect(updated).toHaveLength(3);
	});

	it('supports keyboard-friendly reordering and property editing', async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<WidgetLayout
				widgets={widgets}
				editing
				disabled={false}
				onChange={onChange}
				renderWidget={item => <p>{item.title}</p>}
			/>,
		);
		await user.click(screen.getByRole('button', { name: 'Kachel Solar nach unten' }));
		expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([widgets[0], widgets[1], widgets[2]]));
		expect(onChange.mock.calls[0][0].map((widget: DashboardWidgetConfig) => widget.id)).toEqual(['b', 'a', 'c']);
		await user.click(screen.getByRole('button', { name: 'Kachel Solar bearbeiten' }));
		await user.clear(screen.getByLabelText('Titel'));
		await user.type(screen.getByLabelText('Titel'), 'PV Strom');
		await user.selectOptions(screen.getByLabelText('Kachelbreite'), '2');
		await user.click(screen.getByRole('button', { name: 'Kacheländerungen speichern' }));
		expect(onChange.mock.lastCall?.[0][0]).toMatchObject({ title: 'PV Strom', span: 2 });
	});

	it('allows native drag-drop reordering without introducing an external library', () => {
		const onChange = vi.fn();
		const view = render(
			<WidgetLayout
				widgets={widgets}
				editing
				disabled={false}
				onChange={onChange}
				renderWidget={item => <p>{item.title}</p>}
			/>,
		);
		const dataTransfer = { effectAllowed: '', setData: vi.fn(), getData: () => 'a' };
		fireEvent.dragStart(screen.getByRole('button', { name: 'Kachel Solar ziehen' }), { dataTransfer });
		const third = view.container.querySelectorAll('.grid > div')[2];
		expect(third).toBeDefined();
		fireEvent.dragOver(third, { dataTransfer });
		fireEvent.drop(third, { dataTransfer });
		expect(onChange.mock.calls[0][0].map((widget: DashboardWidgetConfig) => widget.id)).toEqual(['b', 'c', 'a']);
	});
});
