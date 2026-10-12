// Placeholder bike + rider made of primitives (real .glb models arrive in M4).
// Interpolates between fixed steps, aligns smoothly to the ground normal, leans
// into turns and spins the wheels.

import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { config } from '../config';
import type { RiderController } from './RiderController';

const WHEEL_RADIUS = 0.34;

export class RiderVisual {
  /** World position/orientation of the bike (follows the ground). */
  readonly root: TransformNode;
  /** Child of root that rolls into turns. */
  private readonly leanNode: TransformNode;
  private readonly wheels: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];

  private readonly up = new Vector3(0, 1, 0);
  private readonly targetUp = new Vector3();
  private readonly forward = new Vector3();
  private readonly tmp = new Vector3();
  private lean = 0;
  private wheelAngle = 0;

  constructor(scene: Scene) {
    this.root = new TransformNode('rider', scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.leanNode = new TransformNode('riderLean', scene);
    this.leanNode.parent = this.root;

    const frameMat = this.material(scene, 'frame', new Color3(0.95, 0.35, 0.1));
    const tyreMat = this.material(scene, 'tyre', new Color3(0.1, 0.1, 0.1));
    const riderMat = this.material(scene, 'riderBody', new Color3(0.15, 0.35, 0.8));
    const helmetMat = this.material(scene, 'helmet', new Color3(0.95, 0.85, 0.15));

    const frame = MeshBuilder.CreateBox('frame', { width: 0.12, height: 0.35, depth: 1.05 }, scene);
    frame.position.set(0, WHEEL_RADIUS + 0.2, 0);
    frame.material = frameMat;
    frame.parent = this.leanNode;

    for (const z of [0.55, -0.55]) {
      const wheel = MeshBuilder.CreateCylinder(
        'wheel',
        { diameter: WHEEL_RADIUS * 2, height: 0.09, tessellation: 14 },
        scene,
      );
      wheel.rotation.z = Math.PI / 2;
      const hub = new TransformNode('hub', scene);
      hub.position.set(0, WHEEL_RADIUS, z);
      hub.parent = this.leanNode;
      wheel.parent = hub;
      wheel.material = tyreMat;
      this.wheels.push(wheel);
    }

    const torso = MeshBuilder.CreateCapsule('torso', { radius: 0.2, height: 0.95 }, scene);
    torso.position.set(0, WHEEL_RADIUS + 0.85, -0.1);
    torso.rotation.x = 0.55; // leaning forward over the bars
    torso.material = riderMat;
    torso.parent = this.leanNode;

    const head = MeshBuilder.CreateSphere('helmet', { diameter: 0.32, segments: 8 }, scene);
    head.position.set(0, WHEEL_RADIUS + 1.3, 0.2);
    head.material = helmetMat;
    head.parent = this.leanNode;
  }

  /** Called every render frame with the fixed-step interpolation factor. */
  update(rider: RiderController, alpha: number, frameDt: number): void {
    const s = rider.state;
    const p = rider.prevPos;
    this.root.position.set(
      p.x + (s.pos.x - p.x) * alpha,
      p.y + (s.pos.y - p.y) * alpha,
      p.z + (s.pos.z - p.z) * alpha,
    );
    const heading = rider.prevHeading + (s.heading - rider.prevHeading) * alpha;

    // Smoothly align "up" with the ground normal (in the air, drift back to vertical).
    const cfg = config.rider;
    const n = s.grounded ? s.groundNormal : { x: 0, y: 1, z: 0 };
    this.targetUp.set(n.x, n.y, n.z);
    const k = 1 - Math.exp(-cfg.alignRate * frameDt);
    Vector3.SlerpToRef(this.up, this.targetUp, k, this.up);
    this.up.normalize();

    // Forward = heading direction flattened onto the smoothed ground plane.
    this.forward.set(Math.sin(heading), 0, Math.cos(heading));
    const d = Vector3.Dot(this.forward, this.up);
    this.forward.subtractInPlace(this.up.scaleToRef(d, this.tmp)).normalize();
    Quaternion.FromLookDirectionLHToRef(this.forward, this.up, this.root.rotationQuaternion!);

    // Lean into turns: proportional to yaw rate × speed.
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const targetLean = Math.max(-cfg.leanMax, Math.min(cfg.leanMax, s.turnRate * speed * cfg.leanFactor));
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-cfg.leanRate * frameDt));
    this.leanNode.rotation.z = -this.lean;

    // Wheel spin from ground speed.
    if (s.grounded) this.wheelAngle += (s.speed / WHEEL_RADIUS) * frameDt;
    for (const w of this.wheels) (w.parent as TransformNode).rotation.x = this.wheelAngle;
  }

  dispose(): void {
    this.root.dispose(false, true);
    for (const m of this.materials) m.dispose();
  }

  private material(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(0.15, 0.15, 0.15);
    this.materials.push(m);
    return m;
  }
}
