const config = require('./config')
const pathfinder = require('./pathfinder')
const ATTACK_COOLDOWN_MS = 550 // ~11 ticks, never spams hit packets
class Combat {
  constructor(bot) { this.bot = bot; this.lastAttack = 0; this.lastGoal = null }
  // Returns true when combat owns this tick (mining pauses).
  update() {
    if (!config.combatEnabled) return false
    const { entities, self, world, movement, gate } = this.bot
    const threat = entities.nearestHostile(self.pos, config.combatRadius)
    if (!threat) { this.lastGoal = null; return false }
    // Flee below the health threshold: path directly away from the threat.
    if (self.health > 0 && self.health <= config.fleeHealth) {
      const dx = self.pos.x - threat.pos.x, dz = self.pos.z - threat.pos.z
      const d = Math.hypot(dx, dz) || 1
      const away = {
        x: Math.floor(self.pos.x + (dx / d) * 16),
        y: Math.floor(self.pos.y),
        z: Math.floor(self.pos.z + (dz / d) * 16),
      }
      if (movement.isDone()) {
        const p = pathfinder.toCoord(world, self.pos, away)
        if (p) movement.setPath(p)
      }
      return true
    }
    const dist = Math.hypot(threat.pos.x - self.pos.x, threat.pos.y - self.pos.y, threat.pos.z - self.pos.z)
    if (dist > 2.8) {
      // Repath only when the target has moved meaningfully — no per-tick A*.
      const moved = !this.lastGoal ||
        Math.hypot(threat.pos.x - this.lastGoal.x, threat.pos.z - this.lastGoal.z) > 2
      if (movement.isDone() || moved) {
        const p = pathfinder.nearEntity(world, self.pos, threat.pos)
        if (p) { movement.setPath(p); this.lastGoal = { ...threat.pos } }
      }
      return true
    }
    if (Date.now() - this.lastAttack >= ATTACK_COOLDOWN_MS) {
      this.lastAttack = Date.now()
      gate.send('inventory_transaction', {
        transaction: {
          legacy: { legacy_request_id: 0 },
          transaction_type: 'item_use_on_entity',
          actions: [],
          transaction_data: {
            entity_runtime_id: threat.id,
            action_type: 'attack',
            hotbar_slot: 0,
            held_item: { network_id: 0 },
            player_pos: { x: self.pos.x, y: self.pos.y + 1.62, z: self.pos.z },
            click_pos: { x: 0, y: 0, z: 0 },
          },
        },
      })
    }
    return true
  }
}
module.exports = Combat
