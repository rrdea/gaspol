// Keyboard input mapped to game actions. Gameplay code asks about actions, never keys,
// so controls can be remapped and gamepad/touch can be added later.

export type Action =
  | 'steerLeft'
  | 'steerRight'
  | 'pedal'
  | 'brake'
  | 'jump'
  | 'grab'
  | 'respawn'
  | 'pause'
  | 'debug';

export type KeyBindings = Record<Action, readonly string[]>;

/** Default bindings, by KeyboardEvent.code. */
export const defaultBindings: KeyBindings = {
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  pedal: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  grab: ['ShiftLeft', 'ShiftRight'],
  respawn: ['KeyR'],
  pause: ['Escape'],
  debug: ['F3'],
};

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private codeToAction = new Map<string, Action>();

  constructor(
    private readonly target: Window = window,
    bindings: KeyBindings = defaultBindings,
  ) {
    this.setBindings(bindings);
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  setBindings(bindings: KeyBindings): void {
    this.codeToAction = new Map();
    for (const [action, codes] of Object.entries(bindings) as [Action, readonly string[]][]) {
      for (const code of codes) this.codeToAction.set(code, action);
    }
  }

  isDown(action: Action): boolean {
    for (const code of this.down) if (this.codeToAction.get(code) === action) return true;
    return false;
  }

  /** True once per key press. Cleared by endStep(). */
  wasPressed(action: Action): boolean {
    for (const code of this.pressed) if (this.codeToAction.get(code) === action) return true;
    return false;
  }

  /** -1 (left) .. 1 (right). */
  steerAxis(): number {
    return (this.isDown('steerRight') ? 1 : 0) - (this.isDown('steerLeft') ? 1 : 0);
  }

  /** Call after each consumer has read wasPressed() for the frame. */
  endStep(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.codeToAction.has(e.code)) return;
    e.preventDefault(); // stop arrows/space scrolling the page
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
  };
}
