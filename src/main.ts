// Boot: find the canvas and HUD, start the game, hide the loading screen.

import './ui/styles.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;

const game = new Game(canvas, hud);

// Dev-only console/test hook, e.g. __gaspol.race.debugPlace(150). Stripped from production builds.
if (import.meta.env.DEV) (window as unknown as { __gaspol: Game }).__gaspol = game;
game
  .start()
  .then(() => loading.classList.add('hidden'))
  .catch((err: unknown) => {
    console.error(err);
    loading.textContent = 'Failed to start Gas Pol. See console for details.';
  });
