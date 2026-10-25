import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches a crash inside one screen so the rest of the game keeps working.
 * Without it, one broken panel (often an old save missing a newer field)
 * blanks the whole page and every link looks dead.
 */
export class Guard extends Component<{ children: ReactNode; label?: string; onReset?: () => void; resetKey?: unknown }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error(`[LLV] ${this.props.label ?? 'screen'} crashed`, err, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: unknown }) { if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: undefined }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="m-3 rounded-md border border-blood-500/60 bg-blood-500/10 p-3 text-sm" role="alert" data-testid="guard">
        <div className="font-semibold text-red-300">{this.props.label ?? 'This screen'} hit a snag.</div>
        <div className="mt-1 text-xs text-stone-400">The rest of the game is fine. Close this and carry on; the problem has been noted.</div>
        <div className="mt-1 text-[10px] text-stone-600 break-all">{this.state.err.message}</div>
        <button type="button" className="btn-ghost mt-2 text-xs" onClick={() => { this.setState({ err: undefined }); this.props.onReset?.(); }}>Try again</button>
      </div>
    );
  }
}
