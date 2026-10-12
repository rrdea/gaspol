// Builds the track props from TrackData: kicker ramps (custom wedges with GROUND-filtered
// Havok mesh colliders, so the rider rides up and launches off them), rocks and trees
// (thin instances: one draw call per mesh, static Havok shapes in one OBSTACLE-filtered
// body), plus the plain obstacle list the rider's crash check uses.

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
import {
  PhysicsShapeContainer,
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
} from '@babylonjs/core/Physics/v2/physicsShape';
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import { config } from '../config';
import type { TrackTerrain } from './TrackTerrain';
import { rockLayout, treeLayout, type Placement, type RampDef, type TrackDef } from './TrackData';
import type { Obstacle } from './obstacles';

/** Number of segments in the curved kicker surface. */
const RAMP_SEGMENTS = 8;
/** Exponent of the kicker curve y = h * t^k (higher = steeper lip). */
const RAMP_CURVE = 1.6;
/** Placeholder tree proportions, per unit of tree radius. */
const TRUNK_HEIGHT = 2.2;
const TRUNK_RADIUS = 0.28;
const CROWN_HEIGHT = 5.5;
const CROWN_BASE = 1.5;

export class Props {
  readonly obstacles: Obstacle[] = [];
  private readonly meshes: Mesh[] = [];
  private readonly aggregates: PhysicsAggregate[] = [];
  private readonly materials: StandardMaterial[] = [];
  private readonly bodies: PhysicsBody[] = [];
  private readonly shapes: PhysicsShapeContainer[] = [];
  private readonly nodes: TransformNode[] = [];

  constructor(
    scene: Scene,
    def: TrackDef,
    private readonly terrain: TrackTerrain,
    finishS: number,
  ) {
    const rampMat = this.material(scene, 'rampMat', new Color3(0.62, 0.45, 0.28));
    for (const r of def.ramps) this.buildRamp(scene, r, rampMat);
    this.buildRocks(scene, rockLayout(def, finishS));
    this.buildTrees(scene, treeLayout(def, terrain.path.length));
  }

  dispose(): void {
    for (const a of this.aggregates) a.dispose();
    for (const b of this.bodies) b.dispose();
    for (const s of this.shapes) s.dispose();
    for (const n of this.nodes) n.dispose();
    for (const m of this.meshes) m.dispose();
    for (const m of this.materials) m.dispose();
  }

  /** World position of a track-space point on the ground. */
  private place(s: number, offset: number): Vector3 {
    const c = this.terrain.path.sampleAt(s);
    const x = c.x + Math.cos(c.heading) * offset;
    const z = c.z - Math.sin(c.heading) * offset;
    return new Vector3(x, this.terrain.heightSL(s, offset), z);
  }

  private material(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = Color3.Black();
    m.freeze();
    this.materials.push(m);
    return m;
  }

  private buildRamp(scene: Scene, r: RampDef, mat: StandardMaterial): void {
    const mesh = new Mesh('ramp', scene);
    rampVertexData(r, config.props.rampSkirt).applyToMesh(mesh, false);
    mesh.material = mat;

    // Aligned with the track and pitched to the local grade.
    const { terrain } = this;
    const heading = terrain.path.sampleAt(r.s).heading;
    const drop = terrain.heightSL(r.s, r.offset) - terrain.heightSL(r.s + r.length, r.offset);
    const pitch = Math.atan2(drop, r.length);
    // Sit on the lowest ground under the front edge so there is no gap.
    const half = r.width / 2;
    const foot = this.place(r.s, r.offset);
    foot.y =
      Math.min(
        terrain.heightSL(r.s, r.offset - half),
        terrain.heightSL(r.s, r.offset),
        terrain.heightSL(r.s, r.offset + half),
      ) - 0.05;
    mesh.position.copyFrom(foot);
    mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(heading, pitch, 0);
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
    mesh.isPickable = false;

    const agg = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, { mass: 0 }, scene);
    agg.shape.filterMembershipMask = config.physics.filterGround;
    this.aggregates.push(agg);
    this.meshes.push(mesh);
  }

  private staticContainer(scene: Scene, name: string): PhysicsShapeContainer {
    const node = new TransformNode(name, scene);
    const container = new PhysicsShapeContainer(scene);
    container.filterMembershipMask = config.physics.filterObstacle;
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, scene);
    this.nodes.push(node);
    this.shapes.push(container);
    this.bodies.push(body);
    return container;
  }

  private finishContainer(container: PhysicsShapeContainer): void {
    this.bodies[this.shapes.indexOf(container)].shape = container;
  }

  private buildRocks(scene: Scene, placements: Placement[]): void {
    const rock = MeshBuilder.CreateIcoSphere('rock', { radius: 1, subdivisions: config.props.rockDetail, flat: true }, scene);
    rock.material = this.material(scene, 'rockMat', new Color3(0.5, 0.48, 0.45));
    rock.isPickable = false;
    this.meshes.push(rock);

    const container = this.staticContainer(scene, 'rocks');
    const matrices = new Float32Array(placements.length * 16);
    const m = new Matrix();
    const q = new Quaternion();
    const scale = new Vector3();
    placements.forEach((p, i) => {
      const pos = this.place(p.s, p.offset);
      // Partly buried; squashed a little for variety.
      pos.y += p.radius * 0.25;
      scale.set(p.radius * (1 + p.variant * 0.3), p.radius * (0.7 + p.variant * 0.2), p.radius);
      Quaternion.RotationYawPitchRollToRef(p.variant * Math.PI * 2, p.variant, 0, q);
      Matrix.ComposeToRef(scale, q, pos, m);
      m.copyToArray(matrices, i * 16);

      // Collision sphere slightly smaller than the visual so grazes feel fair.
      const r = p.radius * 0.9;
      this.obstacles.push({ kind: 'sphere', x: pos.x, y: pos.y, z: pos.z, radius: r });
      const sphere = new PhysicsShapeSphere(Vector3.Zero(), r, scene);
      sphere.filterMembershipMask = config.physics.filterObstacle;
      container.addChild(sphere, pos);
    });
    rock.thinInstanceSetBuffer('matrix', matrices, 16, true);
    // Bounds must cover every instance, or the whole batch is culled with the base mesh.
    rock.thinInstanceRefreshBoundingInfo();
    rock.freezeWorldMatrix();
    this.finishContainer(container);
  }

  private buildTrees(scene: Scene, placements: Placement[]): void {
    // Unit trunk and crown with their base at the origin, scaled per instance.
    const trunk = MeshBuilder.CreateCylinder('trunk', { height: 1, diameter: 1, tessellation: 6 }, scene);
    trunk.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
    const crown = MeshBuilder.CreateCylinder('crown', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 7 }, scene);
    crown.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
    trunk.material = this.material(scene, 'trunkMat', new Color3(0.38, 0.26, 0.16));
    crown.material = this.material(scene, 'crownMat', new Color3(0.18, 0.42, 0.2));
    for (const mesh of [trunk, crown]) {
      mesh.isPickable = false;
      this.meshes.push(mesh);
    }

    const container = this.staticContainer(scene, 'trees');
    const trunkM = new Float32Array(placements.length * 16);
    const crownM = new Float32Array(placements.length * 16);
    const m = new Matrix();
    const q = new Quaternion();
    const scale = new Vector3();
    const top = new Vector3();
    placements.forEach((p, i) => {
      const base = this.place(p.s, p.offset);
      base.y -= 0.3; // sink into slopes
      const size = p.radius;
      const trunkH = TRUNK_HEIGHT * size;
      const trunkR = TRUNK_RADIUS * size;
      Quaternion.RotationYawPitchRollToRef(p.variant * Math.PI * 2, 0, 0, q);

      scale.set(trunkR * 2, trunkH, trunkR * 2);
      Matrix.ComposeToRef(scale, q, base, m);
      m.copyToArray(trunkM, i * 16);

      const crownR = CROWN_BASE * size * (0.85 + p.variant * 0.3);
      scale.set(crownR * 2, CROWN_HEIGHT * size, crownR * 2);
      top.set(base.x, base.y + trunkH * 0.6, base.z);
      Matrix.ComposeToRef(scale, q, top, m);
      m.copyToArray(crownM, i * 16);

      this.obstacles.push({ kind: 'cylinder', x: base.x, z: base.z, y0: base.y, height: trunkH, radius: trunkR * 1.5 });
      const cyl = new PhysicsShapeCylinder(Vector3.Zero(), new Vector3(0, trunkH, 0), trunkR, scene);
      cyl.filterMembershipMask = config.physics.filterObstacle;
      container.addChild(cyl, base);
    });
    trunk.thinInstanceSetBuffer('matrix', trunkM, 16, true);
    crown.thinInstanceSetBuffer('matrix', crownM, 16, true);
    for (const mesh of [trunk, crown]) {
      mesh.thinInstanceRefreshBoundingInfo();
      mesh.freezeWorldMatrix();
    }
    this.finishContainer(container);
  }
}

/** Kicker ramp geometry in local space: foot at the origin, rising along +Z, flat-shaded. */
export function rampVertexData(r: RampDef, skirt: number): VertexData {
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
