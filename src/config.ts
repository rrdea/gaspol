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
    /** Havok collision-filter bits. Ground raycasts only see GROUND (terrain, ramps). */
    filterGround: 1,
    filterObstacle: 2,
    filterQuery: 4,
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
    /** Below this speed, turning fades out to minTurnFactor (enough to turn around when stopped). */
    minTurnSpeed: 2.0,
    minTurnFactor: 0.35,
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
    /** Below this speed the bike never launches off a lip (it just rolls over). */
    minLaunchSpeed: 6,
    /** Fraction of along-ground speed kept on a long landing; short hops lose proportionally less. */
    landingSpeedKeep: 0.92,
    /** Airtime at which the full landing speed loss applies. */
    landingLossAirTime: 0.6,

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

  jump: {
    /** Holding jump longer than this gives no extra height. */
    maxChargeTime: 0.6,
    /** Take-off speed along the ground normal for a tap / a full charge. */
    minJumpSpeed: 3.5,
    maxJumpSpeed: 7.0,
    /** Grace period after leaving the ground in which a jump still works. */
    coyoteTime: 0.12,
  },

  air: {
    /** Max flip (pitch) and spin (yaw) rates, rad/s. */
    flipRate: 7.5,
    spinRate: 7.0,
    /** How fast the angular velocity chases the input (per second). */
    rotResponse: 14,
    /** With no rotation input and within autoLevelZone of a landable orientation (the slope
     * below for pitch, the nearest 180° for spin), the bike eases into it at this gain,
     * capped at autoLevelMaxRate. Outside the zone, released rotation slows to a stop. */
    autoLevelZone: 60 * DEG,
    autoLevelGain: 2.5,
    autoLevelMaxRate: 2.5,
  },

  landing: {
    /** Below this error the landing is clean, above crashAngle it is a crash. */
    cleanLandingAngle: 25 * DEG,
    crashAngle: 55 * DEG,
    /** Speed kept on a sloppy landing (on top of rider.landingSpeedKeep). */
    sloppySpeedKeep: 0.6,
  },

  tricks: {
    flipPoints: 1000,
    /** Points per 180° of spin. */
    spinPointsPer180: 250,
    grabPoints: 300,
    /** Extra grab points per second held beyond minGrabTime. */
    grabPointsPerSecond: 400,
    minGrabTime: 0.3,
    /** A rotation counts if it is within this much of a full flip / half spin. */
    flipTolerance: 45 * DEG,
    spinTolerance: 40 * DEG,
    /** Score multiplier gained per second of airtime. */
    airtimeBonus: 0.25,
    /** A trick within this much ground time of the last landing continues the combo. */
    comboWindow: 2.0,
    comboStep: 1,
    maxMultiplier: 5,
    /** Speed boost per clean-landed trick, and the cap for one landing. */
    boostPerTrick: 2.0,
    maxBoost: 5.0,
    /** How long the HUD popup stays on screen. */
    popupTime: 2.0,
  },

  crash: {
    /** Seconds from crash to respawn. */
    respawnDelay: 1.5,
    /** Deceleration of the tumbling rider. */
    crashFriction: 12,
    /** Rider collision sphere for obstacles. */
    riderRadius: 0.6,
    /** Head-on speed into an obstacle above which you crash. */
    crashImpactSpeed: 8,
    /** Speed kept after a soft bump into an obstacle. */
    bumpSpeedKeep: 0.3,
    /** Save a respawn point this often while riding cleanly on the trail. */
    safePointInterval: 1.0,
    /** Speed given on respawn. */
    respawnSpeed: 8,
    /** No safe points from this far before a ramp to its lip (don't respawn into a kicker). */
    rampClearance: 30,
    /** Only record safe points this fast, on bare terrain (within this height of it). */
    safeMinSpeed: 3,
    safeTerrainTolerance: 0.3,
    /** Falling this far below the slope profile counts as out of bounds. */
    killDepth: 40,
    /** Riding within this distance of the bottom of the hill respawns you. */
    endMargin: 20,
  },

  visual: {
    /** Squat depth at full jump charge (fraction of height). */
    chargeSquat: 0.15,
    /** How fast grab/riding poses blend (per second). */
    poseRate: 12,
    /** Crash tumble: initial spin (rad/s), its decay (per second), and the rider's throw. */
    tumbleSpin: 9,
    tumbleDecay: 2.5,
    throwSpeed: 5,
    throwUp: 4,
  },

  props: {
    /** Ramp collider skirt buried under the terrain so bumps never leave a gap. */
    rampSkirt: 1.5,
    rockDetail: 1,
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
    wanderAmp: 10,
    wanderPeriod: 220,
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

/** The slice of config the pure rider step needs. */
export const riderPhysicsConfig = {
  rider: config.rider,
  jump: config.jump,
  air: config.air,
  landing: config.landing,
  crash: config.crash,
  gravity: config.physics.gravity,
};
