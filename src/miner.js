const config = require('./config')
const pathfinder = require('./pathfinder')
const log = require('./log')
class Miner {
  constructor(bot) { this.bot = bot; this.state = 'IDLE'; this.target = null; this.breakUntil = 0 }
  update() {
    const { world, movement, gate, self, entities } = this.bot
    switch (this.state) {
      case 'IDLE': {
        // Opportunistic pickup: server auto-collects drops within ~1 block.
        const item = entities.nearestItem(self.pos, 8)
        if (item) {
          const p = pathfinder.toCoord(world, self.pos, item)
          if (p) { movement.setPath(p); this.state = 'PICKUP'; return }
        }
        const res = world.nearestResource(self.pos, config.wantedBlocks)
        if (!res) return
        const path = pathfinder.nearBlock(world, self.pos, res.pos)
        if (!path) { world.resources.delete(world.bkey(res.pos)); return } // unreachable — forget it
        this.target = res
        movement.setPath(path)
        this.state = 'GOTO'
        return
      }
      case 'PICKUP':
        if (movement.isDone()) this.state = 'IDLE'
        return
      case 'GOTO': {
        if (!movement.isDone()) return
        const t = this.target.pos
        const d2 = (t.x + 0.5 - self.pos.x) ** 2 + (t.y - self.pos.y) ** 2 + (t.z + 0.5 - self.pos.z) ** 2
        if (d2 > 5 * 5) { this.state = 'IDLE'; return } // path fell short — retry
        gate.send('player_action', {
          runtime_entity_id: self.runtimeId,
          action: 'start_break',
          position: t, result_position: t, face: 1,
        })
        // Break time keyed by block (config could map per-block; default fists).
        this.breakUntil = Date.now() + config.breakMsDefault
        this.state = 'BREAKING'
        return
      }
      case 'BREAKING': {
        if (Date.now() < this.breakUntil) return
        const t = this.target.pos
        gate.send('player_action', {
          runtime_entity_id: self.runtimeId,
          action: 'stop_break',
          position: t, result_position: t, face: 1,
        })
        gate.send('inventory_transaction', {
          transaction: {
            legacy: { legacy_request_id: 0 },
            transaction_type: 'item_use',
            actions: [],
            transaction_data: {
              action_type: 'break_block',
              block_position: t, face: 1, hotbar_slot: 0,
              held_item: { network_id: 0 },
              player_pos: { x: self.pos.x, y: self.pos.y + 1.62, z: self.pos.z },
              click_pos: { x: 0.5, y: 0.5, z: 0.5 },
              block_runtime_id: 0,
            },
          },
        })
        // Optimistic local update; the server's update_block packet is the
        // real confirmation and is also applied in index.js.
        world.applyBlockUpdate(t, true)
        log.info(`mined ${this.target.name} at ${t.x},${t.y},${t.z}`)
        this.target = null
        this.state = 'IDLE'
        return
      }
    }
  }
}
module.exports = Miner
