// Boot: find the canvas and HUD, start the game, hide the loading screen.

import './ui/styles.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;

const game = new Game(canvas, hud);
game
  .start()
  .then(() => loading.classList.add('hidden'))
  .catch((err: unknown) => {
    console.error(err);
    loading.textContent = 'Failed to start Gas Pol. See console for details.';
  });
