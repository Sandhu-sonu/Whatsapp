import { WorkerState } from './events';

export class WorkerStateManager {
  private currentState: WorkerState = 'STOPPED';

  constructor(private onStateChange: (state: WorkerState, error?: string) => void) {}

  public get(): WorkerState {
    return this.currentState;
  }

  public set(state: WorkerState, error?: string) {
    if (this.currentState === state && !error) return;
    this.currentState = state;
    this.onStateChange(state, error);
  }
}
