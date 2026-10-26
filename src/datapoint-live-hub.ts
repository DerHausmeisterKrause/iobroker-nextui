export interface StateSubscriptionApi {
	subscribeForeignStatesAsync(id: string): Promise<void>;
	unsubscribeForeignStatesAsync(id: string): Promise<void>;
}

export type LiveListener = (id: string) => void;

/**
 * Reference-counted subscriptions: multiple browser connections watching the
 * same state share exactly one ioBroker state subscription.
 */
export class DatapointLiveHub {
	private readonly listeners = new Map<string, Set<LiveListener>>();
	private operations: Promise<void> = Promise.resolve();

	public constructor(private readonly adapter: StateSubscriptionApi) {}

	public subscribe(ids: readonly string[], listener: LiveListener): Promise<() => Promise<void>> {
		return this.enqueue(async () => {
			const added: string[] = [];
			try {
				for (const id of [...new Set(ids)]) {
					let listeners = this.listeners.get(id);
					if (!listeners) {
						await this.adapter.subscribeForeignStatesAsync(id);
						listeners = new Set();
						this.listeners.set(id, listeners);
					}
					listeners.add(listener);
					added.push(id);
				}
			} catch (error) {
				await this.remove(added, listener);
				throw error;
			}
			return () => this.enqueue(() => this.remove(added, listener));
		});
	}

	public publish(id: string): void {
		for (const listener of this.listeners.get(id) ?? []) {
			listener(id);
		}
	}

	public close(): Promise<void> {
		return this.enqueue(async () => {
			const ids = [...this.listeners.keys()];
			this.listeners.clear();
			await Promise.allSettled(ids.map(id => this.adapter.unsubscribeForeignStatesAsync(id)));
		});
	}

	private async remove(ids: readonly string[], listener: LiveListener): Promise<void> {
		for (const id of ids) {
			const listeners = this.listeners.get(id);
			if (!listeners) {
				continue;
			}
			listeners.delete(listener);
			if (listeners.size === 0) {
				this.listeners.delete(id);
				await this.adapter.unsubscribeForeignStatesAsync(id);
			}
		}
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.operations.then(operation, operation);
		this.operations = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
}
