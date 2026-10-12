// Builds the terrain as a ribbon along the track spline: dense columns on the trail,
// wider ones up the banks, split into chunks for frustum culling. Each chunk is a
// vertex-coloured mesh with a static GROUND-filtered Havok mesh collider, which the
// rider's raycasts ride on.

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import { config, type TrackConfig } from '../config';
import { valueNoise2 } from '../core/noise';
import type { TrackTerrain } from './TrackTerrain';

const TRAIL = [0.55, 0.4, 0.26];
const GRASS = [0.33, 0.55, 0.22];
const GRASS_HIGH = [0.45, 0.5, 0.3];
/** Width of the soft trail-to-grass colour blend (m). */
const EDGE_BLEND = 4;
/** Banks fade to the "high" grass colour between these distances outside the trail. */
const HIGH_START = 20;
const HIGH_RANGE = 30;

export class TrackBuilder {
  readonly chunks: Mesh[] = [];
  private readonly aggregates: PhysicsAggregate[] = [];
  private readonly material: StandardMaterial;

  constructor(
    scene: Scene,
    private readonly terrain: TrackTerrain,
    private readonly cfg: TrackConfig,
  ) {
    this.material = new StandardMaterial('terrainMat', scene);
    this.material.diffuseColor = Color3.White();
    this.material.specularColor = Color3.Black();
    this.material.freeze();

    const columns = lateralColumns(cfg);
    const length = terrain.path.length;
    const rowsPerChunk = Math.max(2, Math.round(cfg.chunkLength / cfg.rowStep));
    const totalRows = Math.floor(length / cfg.rowStep) + 1;
    for (let r0 = 0; r0 < totalRows - 1; r0 += rowsPerChunk) {
      const r1 = Math.min(r0 + rowsPerChunk, totalRows - 1);
      this.buildChunk(scene, columns, r0, r1, length);
    }
  }

  dispose(): void {
    for (const a of this.aggregates) a.dispose();
    for (const m of this.chunks) m.dispose();
    this.material.dispose();
  }

  private buildChunk(scene: Scene, columns: number[], r0: number, r1: number, length: number): void {
    const { cfg, terrain } = this;
    const nx = columns.length;
    const nz = r1 - r0 + 1;
    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 4);
    const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);

    for (let j = 0; j < nz; j++) {
      const s = Math.min((r0 + j) * cfg.rowStep, length);
      const c = terrain.path.sampleAt(s);
      const rx = Math.cos(c.heading);
      const rz = -Math.sin(c.heading);
      for (let i = 0; i < nx; i++) {
        const lat = columns[i];
        const v = j * nx + i;
        positions[v * 3] = c.x + rx * lat;
        positions[v * 3 + 1] = terrain.heightSL(s, lat);
        positions[v * 3 + 2] = c.z + rz * lat;

        const outside = Math.abs(lat) - cfg.trailHalfWidth;
        const edge = Math.min(Math.max((outside + EDGE_BLEND / 2) / EDGE_BLEND, 0), 1);
        const high = Math.min(Math.max((outside - HIGH_START) / HIGH_RANGE, 0), 1);
        const tint = 1 + valueNoise2(s * 0.15, lat * 0.15, cfg.seed + 7) * 0.08;
        for (let k = 0; k < 3; k++) {
          const grass = GRASS[k] + (GRASS_HIGH[k] - GRASS[k]) * high;
          colors[v * 4 + k] = (TRAIL[k] + (grass - TRAIL[k]) * edge) * tint;
        }
        colors[v * 4 + 3] = 1;
      }
    }

    let k = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        // Lateral grows to the right and rows go forward: this winding faces up.
        indices[k++] = a;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = b;
        indices[k++] = d;
        indices[k++] = c;
      }
    }

    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.colors = colors;

    const mesh = new Mesh(`terrain${this.chunks.length}`, scene);
    data.applyToMesh(mesh, false);
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    this.chunks.push(mesh);

    const agg = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, scene);
    agg.shape.filterMembershipMask = config.physics.filterGround;
    this.aggregates.push(agg);
  }
}

/** Lateral offsets of the terrain columns: dense on the trail, growing up the banks. */
export function lateralColumns(cfg: TrackConfig): number[] {
  const right: number[] = [];
  const dense = cfg.trailHalfWidth + EDGE_BLEND * 1.5;
  let x = 0;
  let step: number = cfg.trailColumnStep;
  while (x < cfg.halfWidth) {
    right.push(x);
    if (x >= dense) step = Math.min(step * cfg.columnGrowth, cfg.maxColumnStep);
    x += step;
  }
  right.push(cfg.halfWidth);
  const left = right.slice(1).map((v) => -v).reverse();
  return [...left, ...right];
}
