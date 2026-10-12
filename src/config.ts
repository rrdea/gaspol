// Every tuning number in the game lives here, grouped by system.
// Units: metres, seconds, radians, m/s unless the name says otherwise.

const DEG = Math.PI / 180;

export const config = {
  physics: {
    /** Fixed gameplay step (60 Hz). */
    fixedDt: 1 / 60,
    /** Longest frame we simulate in one go; longer frames are dropped to avoid a spiral of death. */
    maxFrameDt: 0.25,
    gravity: 9.81,
  },

  rider: {
    /** Hard cap on ground speed (~100 km/h on the HUD). */
    topSpeed: 27.8,
    /** Quadratic air drag coefficient (accel = k * v^2). Sets terminal speed on a slope. */
    dragCoef: 0.0045,
    /** Drag multiplier while tucking (pedal held above pedalMaxSpeed). */
    tuckDragFactor: 0.65,
    /** Constant rolling-friction deceleration. */
    rollingFriction: 0.35,
    /** Extra acceleration from pedalling; fades to zero at pedalMaxSpeed. */
    pedalAccel: 4.0,
    pedalMaxSpeed: 12,
    /** Deceleration while braking. */
    brakeDecel: 14,

    /** Max yaw rate at low speed (rad/s). */
    turnRate: 1.9,
    /** Fraction of turnRate left at top speed. */
    highSpeedTurnFactor: 0.55,
    /** Turn rate multiplier while braking (sharper turns). */
    brakeTurnBonus: 1.35,
    /** Below this speed, turning fades out (a stopped bike can't turn). */
    minTurnSpeed: 2.0,
    /** How fast the steer value chases the key input (per second). Smooths keyboard steering. */
    steerResponse: 7,
    /** Air steering as a fraction of ground turn rate. */
    airTurnFactor: 0.25,

    /** Rays are cast from this high above the rider and this far below. */
    rayUp: 2.0,
    rayDown: 4.0,
    /** Distance of front/rear wheel ray points from the centre. */
    wheelOffset: 0.55,
    /** If the ground drops away more than this below the predicted position, we go airborne. */
    groundSnap: 0.35,
    /** Fraction of along-ground speed kept on landing (M2 adds the clean/sloppy/crash check). */
    landingSpeedKeep: 0.92,

    /** How fast the body aligns to the ground normal (per second, exp smoothing). */
    alignRate: 12,
    /** Visual lean into turns. */
    leanFactor: 0.045,
    leanMax: 35 * DEG,
    leanRate: 8,

    /** Start position. */
    startX: 0,
    startZ: 5,
  },

  terrain: {
    /** Downhill runs along +Z. */
    length: 1300,
    /** Flat-ish run-up before the start line. */
    startPad: 30,
    width: 180,
    /** Grid resolution (vertices per metre along each axis). */
    cellSize: 1.5,
    /** Base slope (rise/run) and how much it varies along the hill. */
    baseSlope: 0.27,
    slopeVariation: 0.1,
    slopeVariationPeriod: 70,
    /** Rideable trail half width; outside it the terrain rises into banks. */
    trailHalfWidth: 14,
    bankSteepness: 0.035,
    /** Small lateral wander of the trail centre. */
    wanderAmp: 18,
    wanderPeriod: 160,
    /** Two octaves of value-noise bumps. */
    bumpAmp: 0.9,
    bumpFreq: 1 / 22,
    detailAmp: 0.18,
    detailFreq: 1 / 5,
    seed: 1337,
  },

  camera: {
    distance: 7.5,
    height: 2.8,
    /** How far ahead of the rider the camera aims. */
    lookAhead: 6,
    lookHeight: 1.0,
    /** Exponential damping rates (per second). Higher = stiffer. */
    positionDamping: 7,
    yawDamping: 5,
    pitchDamping: 3,
    /** Clamp on how far the camera tilts with the slope. */
    maxPitch: 30 * DEG,
    fov: 60 * DEG,
    near: 0.1,
    far: 600,
    /** Keep the camera this far in front of anything that blocks the view. */
    collisionPadding: 0.4,
    minHeightAboveGround: 0.8,
  },

  world: {
    fogStart: 120,
    fogEnd: 420,
    skyColor: [0.61, 0.76, 0.89] as const,
  },

  hud: {
    /** Debug overlay refresh rate (Hz) – no need to touch the DOM every frame. */
    debugRefreshHz: 10,
  },
} as const;

export type Config = typeof config;
export type RiderConfig = Config['rider'];
export type TerrainConfig = Config['terrain'];
