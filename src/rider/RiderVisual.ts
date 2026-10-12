// Placeholder bike + rider made of primitives (real .glb models arrive in M4).
// Interpolates between fixed steps. On the ground it aligns smoothly to the ground
// normal, leans into turns and spins the wheels; in the air it shows flips, spins and
// grab poses; on a crash the rider is thrown off and both tumble.

import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { config } from '../config';
import type { RiderController } from './RiderController';
import type { GrabName } from './tricks';

const WHEEL_RADIUS = 0.34;
const vis = config.visual;

interface Pose {
  torsoPitch: number;
  torsoY: number;
  torsoZ: number;
  torsoX: number;
}

const RIDING_POSE: Pose = { torsoPitch: 0.55, torsoY: WHEEL_RADIUS + 0.85, torsoZ: -0.1, torsoX: 0 };
const GRAB_POSES: Record<GrabName, Pose> = {
  Superman: { torsoPitch: 1.5, torsoY: WHEEL_RADIUS + 1.15, torsoZ: -0.6, torsoX: 0 },
  'No-Hander': { torsoPitch: -0.15, torsoY: WHEEL_RADIUS + 1.05, torsoZ: -0.25, torsoX: 0 },
  'Can-Can': { torsoPitch: 0.4, torsoY: WHEEL_RADIUS + 0.9, torsoZ: -0.1, torsoX: 0.45 },
};

function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export class RiderVisual {
  /** World position/orientation of the bike (follows the ground). */
  readonly root: TransformNode;
  /** Child of root that rolls into turns and squats when charging. */
  private readonly leanNode: TransformNode;
  /** The rider's body; thrown off on a crash. */
  private readonly riderNode: TransformNode;
  private readonly wheels: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];

  private readonly up = new Vector3(0, 1, 0);
  private readonly targetUp = new Vector3();
  private readonly forward = new Vector3();
  private readonly tmp = new Vector3();
  private readonly airQuat = new Quaternion();
  private lean = 0;
  private wheelAngle = 0;
  private readonly pose: Pose = { ...RIDING_POSE };

  /** Crash animation state. */
  private crashTime = -1;
  private readonly throwVel = new Vector3();
  private readonly tumble = new Vector3();

  constructor(scene: Scene) {
    this.root = new TransformNode('rider', scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.leanNode = new TransformNode('riderLean', scene);
    this.leanNode.parent = this.root;
    this.riderNode = new TransformNode('riderBody', scene);
    this.riderNode.parent = this.leanNode;

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
    torso.material = riderMat;
    torso.parent = this.riderNode;

    const head = MeshBuilder.CreateSphere('helmet', { diameter: 0.32, segments: 8 }, scene);
    head.position.set(0, 0.6, 0);
    head.material = helmetMat;
    head.parent = torso;
    this.applyPose();
  }

  /** Called every render frame with the fixed-step interpolation factor. */
  update(rider: RiderController, alpha: number, frameDt: number): void {
    const s = rider.state;
    const p = rider.prev;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    this.root.position.set(lerp(p.pos.x, s.pos.x), lerp(p.pos.y, s.pos.y), lerp(p.pos.z, s.pos.z));
    const heading = lerp(p.heading, s.heading);

    if (s.phase === 'crashed') {
      this.updateCrash(rider, frameDt);
      return;
    }
    if (this.crashTime >= 0) this.reset();

    const cfg = config.rider;
    if (s.phase === 'airborne') {
      // Heading, then spin about world up, then pitch about the rider's right axis.
      const pitch = lerp(p.airPitch, s.airPitch);
      const yaw = lerp(p.airYaw, s.airYaw);
      Quaternion.RotationYawPitchRollToRef(heading + yaw, -pitch, 0, this.airQuat);
      this.root.rotationQuaternion!.copyFrom(this.airQuat);
      // Track the body's up so the ground alignment blends smoothly after landing.
      this.tmp.set(0, 1, 0).rotateByQuaternionToRef(this.airQuat, this.up);
    } else {
      // Smoothly align "up" with the ground normal.
      const n = s.groundNormal;
      this.targetUp.set(n.x, n.y, n.z);
      Vector3.SlerpToRef(this.up, this.targetUp, damp(cfg.alignRate, frameDt), this.up);
      this.up.normalize();
      // Forward = heading direction flattened onto the smoothed ground plane.
      this.forward.set(Math.sin(heading), 0, Math.cos(heading));
      const d = Vector3.Dot(this.forward, this.up);
      this.forward.subtractInPlace(this.up.scaleToRef(d, this.tmp)).normalize();
      Quaternion.FromLookDirectionLHToRef(this.forward, this.up, this.root.rotationQuaternion!);
    }

    // Lean into turns: proportional to yaw rate × speed (none in the air).
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const leanTarget = s.phase === 'grounded' ? s.turnRate * speed * cfg.leanFactor : 0;
    const targetLean = Math.max(-cfg.leanMax, Math.min(cfg.leanMax, leanTarget));
    this.lean += (targetLean - this.lean) * damp(cfg.leanRate, frameDt);
    this.leanNode.rotation.z = -this.lean;

    // Squat while charging a jump.
    const squat = 1 - vis.chargeSquat * (s.jumpCharge / config.jump.maxChargeTime);
    this.leanNode.scaling.y += (squat - this.leanNode.scaling.y) * damp(vis.poseRate, frameDt);

    // Grab poses.
    const target = rider.grab ? GRAB_POSES[rider.grab] : RIDING_POSE;
    const k = damp(vis.poseRate, frameDt);
    this.pose.torsoPitch += (target.torsoPitch - this.pose.torsoPitch) * k;
    this.pose.torsoY += (target.torsoY - this.pose.torsoY) * k;
    this.pose.torsoZ += (target.torsoZ - this.pose.torsoZ) * k;
    this.pose.torsoX += (target.torsoX - this.pose.torsoX) * k;
    this.applyPose();

    // Wheel spin from ground speed.
    if (s.phase === 'grounded') this.wheelAngle += (s.speed / WHEEL_RADIUS) * frameDt;
    for (const w of this.wheels) (w.parent as TransformNode).rotation.x = this.wheelAngle;
  }

  /** Back to the riding pose (after respawn). */
  reset(): void {
    this.crashTime = -1;
    this.leanNode.rotation.set(0, 0, 0);
    this.leanNode.scaling.set(1, 1, 1);
    this.riderNode.position.set(0, 0, 0);
    this.riderNode.rotation.set(0, 0, 0);
    Object.assign(this.pose, RIDING_POSE);
    this.applyPose();
    this.lean = 0;
  }

  dispose(): void {
    this.root.dispose(false, true);
    for (const m of this.materials) m.dispose();
  }

  private updateCrash(rider: RiderController, dt: number): void {
    if (this.crashTime < 0) {
      // Start: throw the rider forward and up, set random-ish tumble rates.
      this.crashTime = 0;
      const sp = Math.min(rider.state.speed, vis.throwSpeed);
      this.throwVel.set(0, vis.throwUp, sp);
      const side = Math.sin(rider.state.pos.z) > 0 ? 1 : -1;
      this.tumble.set(vis.tumbleSpin, vis.tumbleSpin * 0.4 * side, vis.tumbleSpin * 0.7 * side);
    }
    this.crashTime += dt;
    const decay = Math.exp(-vis.tumbleDecay * this.crashTime);

    // Bike tumbles over on the spot (the root slides with the rider state).
    this.leanNode.rotation.z += this.tumble.z * decay * 0.5 * dt;
    this.leanNode.rotation.x += this.tumble.y * decay * 0.3 * dt;

    // Rider flies off in local space and tumbles, landing around ground level.
    const rp = this.riderNode.position;
    this.throwVel.y -= config.physics.gravity * dt;
    rp.addInPlace(this.throwVel.scale(dt));
    if (rp.y < -0.6) {
      rp.y = -0.6;
      this.throwVel.set(0, 0, this.throwVel.z * 0.5);
    }
    this.riderNode.rotation.x += this.tumble.x * decay * dt;
    this.riderNode.rotation.z += this.tumble.z * decay * dt;
  }

  private applyPose(): void {
    const torso = this.riderNode.getChildMeshes(true)[0];
    torso.position.set(this.pose.torsoX, this.pose.torsoY, this.pose.torsoZ);
    torso.rotation.x = this.pose.torsoPitch;
  }

  private material(scene: Scene, name: string, color: Color3): StandardMaterial {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(0.15, 0.15, 0.15);
    this.materials.push(m);
    return m;
  }
}
