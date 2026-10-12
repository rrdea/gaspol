// Results screen (HTML overlay) shown at the finish: time, best time, trick score and
// best, with NEW RECORD badges and a Retry button (Enter). Next/Menu arrive with the
// menus in later milestones.

import { formatTime } from '../core/race';
import type { RaceResult } from '../core/Events';

export class Results {
  private readonly el: HTMLDivElement;
  private visible = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly onRetry: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'results';
    this.root.appendChild(this.el);
  }

  get shown(): boolean {
    return this.visible;
  }

  show(r: RaceResult): void {
    const badge = (on: boolean) => (on ? ' <span class="badge">NEW RECORD!</span>' : '');
    this.el.innerHTML = `
      <div class="panel">
        <h1>FINISH!</h1>
        <h2>${escapeHtml(r.trackName)}</h2>
        <dl>
          <dt>Time</dt><dd>${formatTime(r.timeMs)}${badge(r.newBestTime)}</dd>
          <dt>Best time</dt><dd>${formatTime(r.bestTimeMs)}</dd>
          <dt>Trick score</dt><dd>${r.trickScore.toLocaleString()}${badge(r.newBestTricks)}</dd>
          <dt>Best tricks</dt><dd>${r.bestTrickScore.toLocaleString()}</dd>
        </dl>
        <button type="button" class="retry">Retry <small>(Enter)</small></button>
      </div>`;
    this.el.querySelector('button')?.addEventListener('click', () => this.onRetry());
    this.el.classList.add('visible');
    this.visible = true;
  }

  hide(): void {
    this.el.classList.remove('visible');
    this.el.replaceChildren();
    this.visible = false;
  }

  dispose(): void {
    this.el.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
