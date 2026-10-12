// Third-person chase camera: sits behind and above the rider, follows with damped
// springs (not rigidly), looks a little ahead, and is pulled in when terrain blocks
// the view. In the air it follows travel direction, not the rider's rotation.

import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { Scene } from '@babylonjs/core/scene';
import { config } from '../config';
import { wrapAngle } from '../core/math';
import type { RiderController } from '../rider/RiderController';
import { groundForward } from '../rider/riderPhysics';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export class ChaseCamera {
  readonly camera: UniversalCamera;
  private yaw = 0;
  /** Smoothed slope pitch of travel (negative = downhill), so the camera sits up the
   * slope behind the rider and looks down it. */
  private pitch = 0;
  /** Smoothed offset from the rider to the camera. Damping the offset (not the world
   * position) keeps the camera tight behind the rider at high speed. */
  private readonly offset = new Vector3();
  private readonly desired = new Vector3();
  private readonly pivot = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly hit = new PhysicsRaycastResult();
  private readonly physics: PhysicsEngine;

  constructor(
    scene: Scene,
    private readonly groundHeight: (x: number, z: number) => number,
  ) {
    const cfg = config.camera;
    this.camera = new UniversalCamera('chaseCam', new Vector3(0, 5, -10), scene);
    this.camera.fov = cfg.fov;
    this.camera.minZ = cfg.near;
    this.camera.maxZ = cfg.far;
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
    this.physics = scene.getPhysicsEngine() as PhysicsEngine;
  }

  /** Jump straight to the resting position (e.g. after respawn). */
  snap(rider: RiderController, target: TransformNode): void {
    this.yaw = rider.state.heading;
    this.pitch = this.travelPitch(rider);
    this.desiredOffset(this.desired);
    this.offset.copyFrom(this.desired);
    this.place(target.position);
  }

  update(rider: RiderController, target: TransformNode, dt: number): void {
    const cfg = config.camera;
    const s = rider.state;

    // Crashed: hold the camera where it is and just watch the tumble.
    if (s.phase === 'crashed') {
      this.lookAt.set(target.position.x, target.position.y + cfg.lookHeight, target.position.z);
      this.camera.setTarget(this.lookAt);
      return;
    }

    // Grounded: follow the bike heading. Airborne: follow travel direction so flips/spins don't swing the view.
    const hSpeed = Math.hypot(s.vel.x, s.vel.z);
    const targetYaw = s.phase === 'airborne' && hSpeed > 1 ? Math.atan2(s.vel.x, s.vel.z) : s.heading;
    this.yaw += wrapAngle(targetYaw - this.yaw) * damp(cfg.yawDamping, dt);
    // Only follow the slope while grounded; in the air keep the last pitch for a stable view.
    if (s.phase === 'grounded') this.pitch += (this.travelPitch(rider) - this.pitch) * damp(cfg.pitchDamping, dt);

    this.desiredOffset(this.desired);
    Vector3.LerpToRef(this.offset, this.desired, damp(cfg.positionDamping, dt), this.offset);
    this.place(target.position);
  }

  dispose(): void {
    this.camera.dispose();
  }

  private travelPitch(rider: RiderController): number {
    const s = rider.state;
    const f = groundForward(s.heading, s.groundNormal);
    const max = config.camera.maxPitch;
    return Math.max(-max, Math.min(max, Math.asin(f.y)));
  }

  /** Unit direction of travel from the smoothed yaw and pitch. */
  private direction(out: Vector3): Vector3 {
    const c = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c);
  }

  private desiredOffset(out: Vector3): void {
    const cfg = config.camera;
    this.direction(out).scaleInPlace(-cfg.distance);
    out.y += cfg.height;
  }

  private place(riderPos: Vector3): void {
    const cfg = config.camera;
    const cam = this.camera.position;
    this.pivot.set(riderPos.x, riderPos.y + 1.2, riderPos.z);
    riderPos.addToRef(this.offset, cam);

    // Pull in if terrain or a prop is between rider and camera.
    this.physics.raycastToRef(this.pivot, cam, this.hit);
    if (this.hit.hasHit) {
      const dir = cam.subtract(this.pivot);
      const len = dir.length();
      const t = Math.max(0, this.hit.hitDistance - cfg.collisionPadding) / (len || 1);
      this.pivot.addToRef(dir.scaleInPlace(t), cam);
    }
    const minY = this.groundHeight(cam.x, cam.z) + cfg.minHeightAboveGround;
    if (cam.y < minY) cam.y = minY;

    this.direction(this.lookAt).scaleInPlace(cfg.lookAhead).addInPlace(riderPos);
    this.lookAt.y += cfg.lookHeight;
    this.camera.setTarget(this.lookAt);
  }
}
