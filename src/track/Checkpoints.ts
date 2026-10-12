// Checkpoint gates: visuals (two posts and a banner across the trail; green start,
// yellow checkpoints, red/white finish) around the pure CheckpointTracker that decides
// when a gate is passed.

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import { config } from '../config';
import { CheckpointTracker } from './checkpointTracker';
import type { TrackTerrain } from './TrackTerrain';

/** Gate geometry (m). */
const POST_HEIGHT = 5.5;
const POST_SIZE = 0.4;
const BANNER_HEIGHT = 1.0;
const BANNER_DEPTH = 0.15;
/** Finish banner checker squares across. */
const FINISH_SQUARES = 16;

export class Checkpoints {
  readonly tracker: CheckpointTracker;
  private readonly meshes: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];

  constructor(
    scene: Scene,
    private readonly terrain: TrackTerrain,
    gates: readonly number[],
    startS: number,
  ) {
    const halfWidth = config.track.gateHalfWidth;
    this.tracker = new CheckpointTracker(gates, halfWidth, startS);

    const post = this.material(scene, 'gatePost', new Color3(0.25, 0.25, 0.28));
    const yellow = this.material(scene, 'gateYellow', new Color3(1.0, 0.8, 0.15));
    const green = this.material(scene, 'gateGreen', new Color3(0.2, 0.75, 0.3));
    const red = this.material(scene, 'gateRed', new Color3(0.9, 0.15, 0.12));
    const white = this.material(scene, 'gateWhite', new Color3(0.95, 0.95, 0.95));

    const width = config.track.trailHalfWidth + 1;
    this.addGate(scene, startS + config.track.startGateAhead, width, post, [green]);
    gates.forEach((s, i) => {
      const finish = i === gates.length - 1;
      this.addGate(scene, s, width, post, finish ? [red, white] : [yellow]);
    });
    this.mergeByMaterial();
  }

  /** One mesh per material keeps the draw calls down. */
  private mergeByMaterial(): void {
    const groups = new Map<StandardMaterial, Mesh[]>();
    for (const m of this.meshes) {
      const mat = m.material as StandardMaterial;
      groups.set(mat, [...(groups.get(mat) ?? []), m]);
    }
    this.meshes.length = 0;
    for (const group of groups.values()) {
      const merged = Mesh.MergeMeshes(group, true, true);
      if (merged) this.freeze(merged);
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const m of this.materials) m.dispose();
  }

  private material(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = Color3.Black();
    m.emissiveColor = color.scale(0.25);
    m.freeze();
    this.materials.push(m);
    return m;
  }

  private addGate(scene: Scene, s: number, halfWidth: number, postMat: StandardMaterial, banner: StandardMaterial[]): void {
    const { terrain } = this;
    const c = terrain.path.sampleAt(s);
    const rx = Math.cos(c.heading);
    const rz = -Math.sin(c.heading);
    const groundCentre = terrain.heightSL(s, 0);

    for (const side of [-1, 1]) {
      const lat = side * halfWidth;
      const base = terrain.heightSL(s, lat);
      // From 1 m below the ground (slopes) up to the banner height above the centre line.
      const bottom = base - 1;
      const h = groundCentre + POST_HEIGHT - bottom;
      const post = MeshBuilder.CreateBox('gatePost', { width: POST_SIZE, depth: POST_SIZE, height: h }, scene);
      post.position.set(c.x + rx * lat, bottom + h / 2, c.z + rz * lat);
      post.material = postMat;
      this.freeze(post);
    }

    // Banner: one box, or a row of alternating squares for the finish.
    const top = groundCentre + POST_HEIGHT - BANNER_HEIGHT / 2;
    const squares = banner.length > 1 ? FINISH_SQUARES : 1;
    const w = (halfWidth * 2) / squares;
    for (let i = 0; i < squares; i++) {
      const lat = -halfWidth + w * (i + 0.5);
      const box = MeshBuilder.CreateBox('gateBanner', { width: w, height: BANNER_HEIGHT, depth: BANNER_DEPTH }, scene);
      box.position.set(c.x + rx * lat, top, c.z + rz * lat);
      box.rotation.y = c.heading;
      box.material = banner[i % banner.length];
      this.freeze(box);
    }
  }

  private freeze(mesh: Mesh): void {
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    this.meshes.push(mesh);
  }
}
