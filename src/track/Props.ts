// Builds the M2 props: kicker ramps (custom wedge meshes with GROUND-filtered Havok
// mesh colliders, so the rider rides up and launches off them) and rocks (one
// thin-instanced mesh, static Havok spheres with the OBSTACLE filter, and a plain
// obstacle list for the rider's crash check).

import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeContainer, PhysicsShapeSphere } from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import { config, type TerrainConfig } from '../config';
import { heightAt, trailCenterX } from './terrainShape';
import { ramps, rockLayout, type RampPlacement } from './m2Layout';
import type { SphereObstacle } from './obstacles';

/** Number of segments in the curved kicker surface. */
const RAMP_SEGMENTS = 8;
/** Exponent of the kicker curve y = h * t^k (higher = steeper lip). */
const RAMP_CURVE = 1.6;

export class Props {
  readonly obstacles: SphereObstacle[] = [];
  private readonly meshes: Mesh[] = [];
  private readonly aggregates: PhysicsAggregate[] = [];
  private readonly materials: StandardMaterial[] = [];
  private rockBody: PhysicsBody | null = null;
  private rockShape: PhysicsShapeContainer | null = null;
  private rockNode: TransformNode | null = null;

  constructor(
    scene: Scene,
    private readonly cfg: TerrainConfig,
  ) {
    const rampMat = this.material(scene, 'rampMat', new Color3(0.62, 0.45, 0.28));
    for (const r of ramps) this.buildRamp(scene, r, rampMat);
    this.buildRocks(scene);
  }

  dispose(): void {
    for (const a of this.aggregates) a.dispose();
    this.rockBody?.dispose();
    this.rockShape?.dispose();
    this.rockNode?.dispose();
    for (const m of this.meshes) m.dispose();
    for (const m of this.materials) m.dispose();
  }

  private material(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = Color3.Black();
    m.freeze();
    this.materials.push(m);
    return m;
  }

  private buildRamp(scene: Scene, r: RampPlacement, mat: StandardMaterial): void {
    const mesh = new Mesh('ramp', scene);
    rampVertexData(r, config.props.rampSkirt).applyToMesh(mesh, false);
    mesh.material = mat;

    // Place on the trail, aligned with the trail direction and pitched to the local slope.
    const { cfg } = this;
    const cx = trailCenterX(r.z, cfg) + r.offset;
    const ahead = r.z + r.length;
    const dx = trailCenterX(ahead, cfg) + r.offset - cx;
    const yaw = Math.atan2(dx, r.length);
    const drop = heightAt(cx, r.z, cfg) - heightAt(cx + dx, ahead, cfg);
    const pitch = Math.atan2(drop, r.length);
    // Sit on the lowest ground under the front edge so there is no gap.
    const half = r.width / 2;
    const y = Math.min(heightAt(cx - half, r.z, cfg), heightAt(cx, r.z, cfg), heightAt(cx + half, r.z, cfg)) - 0.05;
    mesh.position.set(cx, y, r.z);
    mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, pitch, 0);
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
    mesh.isPickable = false;

    const agg = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, scene);
    agg.shape.filterMembershipMask = config.physics.filterGround;
    this.aggregates.push(agg);
    this.meshes.push(mesh);
  }

  private buildRocks(scene: Scene): void {
    const { cfg } = this;
    const rock = MeshBuilder.CreateIcoSphere('rock', { radius: 1, subdivisions: config.props.rockDetail, flat: true }, scene);
    rock.material = this.material(scene, 'rockMat', new Color3(0.5, 0.48, 0.45));
    rock.isPickable = false;
    this.meshes.push(rock);

    this.rockNode = new TransformNode('rocks', scene);
    const container = new PhysicsShapeContainer(scene);
    const placements = rockLayout(cfg);
    const matrices = new Float32Array(placements.length * 16);
    const m = new Matrix();
    const q = new Quaternion();
    const scale = new Vector3();
    const pos = new Vector3();

    placements.forEach((p, i) => {
      const x = trailCenterX(p.z, cfg) + p.offset;
      // Partly buried; squashed a little for variety.
      const y = heightAt(x, p.z, cfg) + p.radius * 0.25;
      pos.set(x, y, p.z);
      scale.set(p.radius * (1 + p.variant * 0.3), p.radius * (0.7 + p.variant * 0.2), p.radius);
      Quaternion.RotationYawPitchRollToRef(p.variant * Math.PI * 2, p.variant, 0, q);
      Matrix.ComposeToRef(scale, q, pos, m);
      m.copyToArray(matrices, i * 16);

      // Collision sphere slightly smaller than the visual so grazes feel fair.
      const r = p.radius * 0.9;
      this.obstacles.push({ x, y, z: p.z, radius: r });
      const sphere = new PhysicsShapeSphere(Vector3.Zero(), r, scene);
      sphere.filterMembershipMask = config.physics.filterObstacle;
      container.addChild(sphere, pos.clone());
    });

    rock.thinInstanceSetBuffer('matrix', matrices, 16, true);
    rock.freezeWorldMatrix();

    container.filterMembershipMask = config.physics.filterObstacle;
    const body = new PhysicsBody(this.rockNode, PhysicsMotionType.STATIC, false, scene);
    body.shape = container;
    this.rockBody = body;
    this.rockShape = container;
  }
}

/** Kicker ramp geometry in local space: foot at the origin, rising along +Z, flat-shaded. */
export function rampVertexData(r: RampPlacement, skirt: number): VertexData {
  const w = r.width / 2;
  const bottom = -skirt;
  // Top profile: curved kicker then a flat deck.
  const profile: { z: number; y: number }[] = [];
  for (let i = 0; i <= RAMP_SEGMENTS; i++) {
    const t = i / RAMP_SEGMENTS;
    profile.push({ z: t * r.length, y: r.height * Math.pow(t, RAMP_CURVE) });
  }
  if (r.deck > 0) profile.push({ z: r.length + r.deck, y: r.height });

  const positions: number[] = [];
  const indices: number[] = [];
  // Each quad gets its own 4 vertices (flat shading). Points are given counter-clockwise
  // as seen from outside, which is front-facing here.
  const quad = (...pts: [number, number, number][]): void => {
    const base = positions.length / 3;
    for (const p of pts) positions.push(...p);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    quad([-w, a.y, a.z], [w, a.y, a.z], [w, b.y, b.z], [-w, b.y, b.z]); // top
    quad([w, bottom, a.z], [w, bottom, b.z], [w, b.y, b.z], [w, a.y, a.z]); // right side
    quad([-w, bottom, b.z], [-w, bottom, a.z], [-w, a.y, a.z], [-w, b.y, b.z]); // left side
  }
  const end = profile[profile.length - 1];
  quad([w, bottom, end.z], [-w, bottom, end.z], [-w, end.y, end.z], [w, end.y, end.z]); // back
  quad([-w, bottom, 0], [w, bottom, 0], [w, 0, 0], [-w, 0, 0]); // front skirt

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  return data;
}
