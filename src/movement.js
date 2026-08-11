const { DANGER } = require('./pathfinder')
const WALK_PER_TICK = 4.317 / 20 // vanilla walk speed at 20 tps
class Movement {
  constructor(gate, self, world) {
    this.gate = gate    // PacketGate
    this.self = self    // shared bot state: runtimeId, pos, yaw, serverAuthMovement, tick
    this.world = world
    this.path = null
    this.idx = 0
  }
  setPath(path) { this.path = path; this.idx = 0 }
  clear() { this.path = null }
  isDone() { return !this.path }
  // Called once per 50ms tick from the main loop. Exactly one movement
  // packet per tick, matching real client cadence.
  tick() {
    if (!this.path) return
    const wp = this.path[this.idx]
    if (!wp) { this.clear(); return }
    const dx = wp.x - this.self.pos.x
    const dz = wp.z - this.self.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.15 && Math.abs(wp.y - this.self.pos.y) < 0.6) {
      this.self.pos = { ...wp }
      if (++this.idx >= this.path.length) this.clear()
      return
    }
    // Live hazard check — the world can change after the path was computed.
    if (DANGER.has(this.world.blockAt(wp.x, wp.y, wp.z))) { this.clear(); return }
    const step = Math.min(WALK_PER_TICK, dist)
    this.self.pos.x += (dx / dist) * step
    this.self.pos.z += (dz / dist) * step
    // Simplified vertical handling: snap toward waypoint height (step/fall).
    if (Math.abs(wp.y - this.self.pos.y) >= 0.5) {
      this.self.pos.y += Math.sign(wp.y - this.self.pos.y) * Math.min(0.4, Math.abs(wp.y - this.self.pos.y))
    }
    this.self.yaw = (Math.atan2(-dx, dz) * 180) / Math.PI
    this.sendPosition()
  }
  sendPosition() {
    const p = this.self
    if (p.serverAuthMovement) {
      // Server-authoritative movement (start_game.movement_authority !== 'client').
      // Field names shift slightly between protocol versions — the PacketGate
      // schema check drops anything invalid, so a mismatch here fails closed
      // and shows up in packets.log instead of reaching the server.
      this.gate.send('player_auth_input', {
        pitch: 0, yaw: p.yaw, head_yaw: p.yaw,
        position: { x: p.pos.x, y: p.pos.y + 1.62, z: p.pos.z },
        move_vector: { x: 0, z: 1 },
        input_data: {}, input_mode: 'mouse', play_mode: 'screen',
        interaction_model: 'crosshair',
        tick: BigInt(p.tick++),
        delta: { x: 0, y: 0, z: 0 },
        analogue_move_vector: { x: 0, z: 1 },
      })
    } else {
      this.gate.send('move_player', {
        runtime_id: p.runtimeId,
        position: { x: p.pos.x, y: p.pos.y + 1.62, z: p.pos.z },
        pitch: 0, yaw: p.yaw, head_yaw: p.yaw,
        mode: 'normal', on_ground: true,
        ridden_runtime_id: 0, tick: BigInt(p.tick++),
      })
    }
  }
}
module.exports = Movement
