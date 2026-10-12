// HTML overlay HUD. M1: big speed readout plus a debug panel (FPS, speed, grounded
// state, heading, position) toggled with F3.

import { config } from '../config';

export interface DebugInfo {
  fps: number;
  speedKmh: number;
  grounded: boolean;
  airTime: number;
  headingDeg: number;
  x: number;
  y: number;
  z: number;
}

export class Hud {
  private readonly speedEl: HTMLDivElement;
  private readonly debugEl: HTMLDivElement;
  private readonly helpEl: HTMLDivElement;
  private sinceRefresh = Infinity;

  constructor(private readonly root: HTMLElement) {
    this.speedEl = this.add('speed');
    this.debugEl = this.add('debug');
    this.helpEl = this.add('help');
    this.helpEl.textContent = 'W/↑ pedal · S/↓ brake · A/D or ←/→ steer · R respawn · F3 debug';
  }

  toggleDebug(): void {
    this.debugEl.classList.toggle('hidden');
  }

  update(info: DebugInfo, frameDt: number): void {
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < 1 / config.hud.debugRefreshHz) return;
    this.sinceRefresh = 0;

    this.speedEl.innerHTML = `${Math.round(info.speedKmh)}<small>km/h</small>`;
    this.debugEl.textContent =
      `FPS      ${info.fps.toFixed(0)}\n` +
      `speed    ${info.speedKmh.toFixed(1)} km/h\n` +
      `state    ${info.grounded ? 'grounded' : `airborne ${info.airTime.toFixed(2)}s`}\n` +
      `heading  ${info.headingDeg.toFixed(0)}°\n` +
      `pos      ${info.x.toFixed(1)}, ${info.y.toFixed(1)}, ${info.z.toFixed(1)}`;
  }

  dispose(): void {
    this.root.replaceChildren();
  }

  private add(cls: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = cls;
    this.root.appendChild(el);
    return el;
  }
}
