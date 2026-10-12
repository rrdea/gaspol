// HTML overlay HUD: speed readout, trick score and combo multiplier, trick popups,
// jump charge bar, landing/crash messages, and a debug panel (F3).

import { config } from '../config';

export interface DebugInfo {
  fps: number;
  speedKmh: number;
  phase: string;
  airTime: number;
  headingDeg: number;
  x: number;
  y: number;
  z: number;
}

export interface FrameInfo {
  speedKmh: number;
  score: number;
  multiplier: number;
  /** Jump charge 0..1. */
  charge: number;
}

export class Hud {
  private readonly speedEl: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly popupEl: HTMLDivElement;
  private readonly messageEl: HTMLDivElement;
  private readonly chargeEl: HTMLDivElement;
  private readonly chargeFill: HTMLDivElement;
  private readonly debugEl: HTMLDivElement;
  private sinceRefresh = Infinity;
  private popupTimer = 0;
  private messageTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.speedEl = this.add('speed');
    this.scoreEl = this.add('score');
    this.popupEl = this.add('popup');
    this.messageEl = this.add('message');
    this.chargeEl = this.add('charge');
    this.chargeFill = document.createElement('div');
    this.chargeEl.appendChild(this.chargeFill);
    this.debugEl = this.add('debug');
    this.add('help').textContent =
      'W/↑ pedal · S/↓ brake · A/D steer · Space jump (hold to charge) · ' +
      'air: S backflip, W frontflip, A/D spin, Shift+dir grab · R respawn · F3 debug';
  }

  toggleDebug(): void {
    this.debugEl.classList.toggle('hidden');
  }

  showTrick(names: string[], points: number, multiplier: number, sloppy: boolean): void {
    const mult = multiplier > 1 ? ` <em>×${multiplier}</em>` : '';
    this.popupEl.innerHTML =
      `<div class="names">${names.join(' + ')}</div>` +
      `<div class="points${sloppy ? ' sloppy' : ''}">+${points.toLocaleString()}${mult}</div>`;
    this.popupEl.classList.add('visible');
    this.popupTimer = config.tricks.popupTime;
  }

  showMessage(text: string, kind: 'crash' | 'sloppy' | 'info'): void {
    this.messageEl.textContent = text;
    this.messageEl.className = `message visible ${kind}`;
    this.messageTimer = config.tricks.popupTime * 0.75;
  }

  /** Per-frame update: cheap DOM writes plus popup timers. */
  update(frame: FrameInfo, debug: DebugInfo, frameDt: number): void {
    this.popupTimer -= frameDt;
    if (this.popupTimer <= 0) this.popupEl.classList.remove('visible');
    this.messageTimer -= frameDt;
    if (this.messageTimer <= 0) this.messageEl.classList.remove('visible');

    this.chargeEl.classList.toggle('visible', frame.charge > 0);
    this.chargeFill.style.width = `${Math.round(frame.charge * 100)}%`;

    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < 1 / config.hud.debugRefreshHz) return;
    this.sinceRefresh = 0;

    this.speedEl.innerHTML = `${Math.round(frame.speedKmh)}<small>km/h</small>`;
    const mult = frame.multiplier > 1 ? `<span class="mult">×${frame.multiplier}</span>` : '';
    this.scoreEl.innerHTML = `<small>TRICKS</small> ${frame.score.toLocaleString()} ${mult}`;
    this.debugEl.textContent =
      `FPS      ${debug.fps.toFixed(0)}\n` +
      `speed    ${debug.speedKmh.toFixed(1)} km/h\n` +
      `state    ${debug.phase}${debug.phase === 'airborne' ? ` ${debug.airTime.toFixed(2)}s` : ''}\n` +
      `heading  ${debug.headingDeg.toFixed(0)}°\n` +
      `pos      ${debug.x.toFixed(1)}, ${debug.y.toFixed(1)}, ${debug.z.toFixed(1)}`;
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
