// Builds the M1 test hill mesh from terrainShape.heightAt: a vertex-coloured grid
// (brown trail, green grass) with a static Havok mesh collider. Gameplay raycasts
// hit this collider. Replaced by the spline TrackBuilder in M3.

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import { config, type TerrainConfig } from '../config';
import { valueNoise2 } from '../core/noise';
import { heightAt, trailCenterX } from './terrainShape';

const TRAIL = [0.55, 0.4, 0.26];
const GRASS = [0.33, 0.55, 0.22];
const GRASS_HIGH = [0.45, 0.5, 0.3];

export class Terrain {
  readonly mesh: Mesh;
  private readonly aggregate: PhysicsAggregate;

  constructor(scene: Scene, private readonly cfg: TerrainConfig) {
    this.mesh = this.buildMesh(scene);
    this.aggregate = new PhysicsAggregate(this.mesh, PhysicsShapeType.MESH, { mass: 0 }, scene);
    this.aggregate.shape.filterMembershipMask = config.physics.filterGround;
  }

  height(x: number, z: number): number {
    return heightAt(x, z, this.cfg);
  }

  dispose(): void {
    this.aggregate.dispose();
    this.mesh.material?.dispose();
    this.mesh.dispose();
  }

  private buildMesh(scene: Scene): Mesh {
    const { cfg } = this;
    const nx = Math.ceil(cfg.width / cfg.cellSize) + 1;
    const nz = Math.ceil((cfg.length + cfg.startPad) / cfg.cellSize) + 1;
    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 4);
    const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);

    for (let j = 0; j < nz; j++) {
      const z = -cfg.startPad + j * cfg.cellSize;
      const centre = trailCenterX(z, cfg);
      for (let i = 0; i < nx; i++) {
        // Grid follows the wandering trail so the banks never run out.
        const x = centre - cfg.width / 2 + i * cfg.cellSize;
        const y = heightAt(x, z, cfg);
        const v = j * nx + i;
        positions[v * 3] = x;
        positions[v * 3 + 1] = y;
        positions[v * 3 + 2] = z;

        const dx = Math.abs(x - centre);
        const edge = Math.min(Math.max((dx - cfg.trailHalfWidth + 2) / 4, 0), 1);
        const high = Math.min(Math.max((dx - cfg.trailHalfWidth - 20) / 30, 0), 1);
        const tint = 1 + valueNoise2(x * 0.15, z * 0.15, cfg.seed + 7) * 0.08;
        for (let c = 0; c < 3; c++) {
          const grass = GRASS[c] + (GRASS_HIGH[c] - GRASS[c]) * high;
          colors[v * 4 + c] = (TRAIL[c] + (grass - TRAIL[c]) * edge) * tint;
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
        // Wound so faces point up in Babylon's left-handed system.
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

    const mesh = new Mesh('terrain', scene);
    data.applyToMesh(mesh, false);

    const mat = new StandardMaterial('terrainMat', scene);
    mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mat.freeze();
    mesh.freezeWorldMatrix();
    return mesh;
  }
}
