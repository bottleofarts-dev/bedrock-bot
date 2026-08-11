const log = require('./log')
const config = require('./config')
// Real-client cadence: Bedrock runs at 20 tps. Same-type packets never go
// out faster than a real client would send them.
const MIN_INTERVAL_MS = {
  move_player: 50,
  player_auth_input: 50,
  player_action: 50,
  inventory_transaction: 100,
  request_chunk_radius: 1000,
  text: 1000,
}
class PacketGate {
  constructor(client) {
    this.client = client
    this.lastSent = new Map()
    this.windowStart = Date.now()
    this.windowCount = 0
  }
  send(name, params) {
    const now = Date.now()
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.windowCount = 0 }
    if (this.windowCount >= config.maxPacketsPerSecond) {
      log.packet('DROP', name, '(global rate cap)')
      return false
    }
    const min = MIN_INTERVAL_MS[name] ?? 25
    if (now - (this.lastSent.get(name) ?? 0) < min) {
      log.packet('DROP', name, '(per-type rate cap)')
      return false
    }
    // Fail closed: serialize against the protocol schema BEFORE queueing.
    // A packet that doesn't fully round-trip through the serializer never
    // leaves this process.
    try {
      this.client.serializer.createPacketBuffer({ name, params })
    } catch (e) {
      log.warn(`refusing malformed ${name}: ${e.message}`)
      log.packet('DROP', name, '(schema validation failed)')
      return false
    }
    try {
      this.client.queue(name, params)
    } catch (e) {
      log.warn(`queue failed for ${name}: ${e.message}`)
      return false
    }
    this.lastSent.set(name, now)
    this.windowCount++
    log.packet('OUT', name)
    return true
  }
}
module.exports = PacketGate
