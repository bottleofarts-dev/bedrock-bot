const bedrock = require('bedrock-protocol')
const config = require('./config')
const log = require('./log')
const PacketGate = require('./packetSafety')
const World = require('./world')
const Entities = require('./entities')
const Movement = require('./movement')
const Miner = require('./miner')
const Combat = require('./combat')
const { buildSkinData } = require('./skin')
class Bot {
  constructor() {
    this.client = null
    this.loop = null
    this.reconnecting = false
    this.tickCount = 0
  }
  connect() {
    if (this.client) { log.warn('connect() called with live client — refusing (no duplicate instances)'); return }
    this.reconnecting = false
    let registry
    try {
      registry = require('prismarine-registry')(`bedrock_${config.version}`)
    } catch (e) {
      throw new Error(`prismarine-registry has no data for bedrock_${config.version}. ` +
        `Verify version support before connecting — do not guess. (${e.message})`)
    }
    this.self = { runtimeId: 0n, pos: { x: 0, y: 64, z: 0 }, yaw: 0, health: 20, tick: 0, serverAuthMovement: false }
    this.world = new World(registry)
    this.entities = new Entities()
    log.info(`connecting to ${config.host}:${config.port} as ${config.username} (version ${config.version})`)
    this.client = bedrock.createClient({
      host: config.host,
      port: config.port,
      username: config.username,
      offline: config.offline,
      version: config.version,       // explicit — never auto-negotiated
      // skinData: buildSkinData(),  // Omit custom skin so bedrock-protocol uses official vanilla defaultSkin on 1.26.40
    })
    this.gate = new PacketGate(this.client)
    this.movement = new Movement(this.gate, this.self, this.world)
    this.miner = new Miner(this)
    this.combat = new Combat(this)
    this.wire()
  }
  wire() {
    const c = this.client
    // Log every inbound packet name for correlation (constraint: instrument,
    // don't guess). bedrock-protocol emits per-packet-name events only, so we
    // wrap emit. Non-packet lifecycle events are filtered out.
    const lifecycle = new Set(['connect', 'session', 'spawn', 'join', 'close', 'error', 'status', 'kick', 'heartbeat'])
    const origEmit = c.emit.bind(c)
    c.emit = (name, ...args) => {
      if (typeof name === 'string' && !lifecycle.has(name)) log.packet('IN', name)
      return origEmit(name, ...args)
    }
    // Resource pack handshake: bedrock-protocol completes info→response→
    // stack→response automatically during login. We log each step to verify
    // it against the pinned library version; if your version does NOT
    // auto-respond, answer here with resource_pack_client_response
    // { response_status: 'completed', resourcepackids: [] } at both steps.
    c.on('resource_packs_info', () => log.info('resource pack handshake: info received'))
    c.on('resource_pack_stack', () => log.info('resource pack handshake: stack received'))
    c.on('start_game', p => {
      try {
        this.self.runtimeId = p.runtime_entity_id
        this.self.pos = { x: p.player_position.x, y: p.player_position.y - 1.62, z: p.player_position.z }
        this.self.serverAuthMovement =
          p.movement_authority ? p.movement_authority !== 'client'
            : p.player_movement_settings?.movement_type !== 'client'
        log.info(`start_game: runtimeId=${this.self.runtimeId} serverAuthMovement=${this.self.serverAuthMovement}`)
        // Never request more than configured; clamped again by the server's reply.
        this.gate.send('request_chunk_radius', { chunk_radius: config.chunkRadius, max_radius: config.chunkRadius })
      } catch (e) { log.warn(`start_game handling: ${e.message}`) }
    })
    c.on('chunk_radius_update', p => {
      config.chunkRadius = Math.min(config.chunkRadius, p.chunk_radius)
      log.info(`server granted chunk radius ${p.chunk_radius}, using ${config.chunkRadius}`)
    })
    c.on('spawn', () => {
      log.info('spawned')
      this.gate.send('set_local_player_as_initialized', { runtime_entity_id: this.self.runtimeId })
      this.startLoop()
    })
    c.on('level_chunk', p => {
      const r = this.world.handleLevelChunk(p)
      if (r.needsSubChunks) {
        log.info(`chunk ${p.x},${p.z} requires sub_chunk request flow`)
        // If your server uses this mode, issue subchunk_request here for the
        // column's sub-chunk offsets; schema is version-specific — validate
        // against your pinned protocol before enabling.
      }
    })
    c.on('subchunk', p => this.world.handleSubChunk(p))
    c.on('update_block', p => {
      try {
        const isAir = p.block_runtime_id === 0
        this.world.applyBlockUpdate(p.position, isAir)
      } catch (e) { log.warn(`update_block: ${e.message}`) }
    })
    c.on('add_entity', p => { try { this.entities.add(p) } catch {} })
    c.on('add_item_entity', p => { try { this.entities.addItem(p) } catch {} })
    c.on('remove_entity', p => { try { this.entities.remove(p.entity_id_self ?? p.runtime_id) } catch {} })
    c.on('move_entity', p => { try { this.entities.moveAbs(p) } catch {} })
    c.on('move_entity_delta', p => { try { this.entities.moveDelta(p) } catch {} })
    c.on('update_attributes', p => {
      try {
        if (p.runtime_entity_id !== this.self.runtimeId) return
        const hp = (p.attributes ?? []).find(a => a.name === 'minecraft:health')
        if (hp) {
          this.self.health = hp.current ?? hp.value
          if (this.self.health <= 0) {
            log.info('died — requesting respawn')
            this.movement.clear()
            this.gate.send('respawn', {
              position: { x: 0, y: 0, z: 0 }, state: 2, runtime_entity_id: this.self.runtimeId,
            })
          }
        }
      } catch (e) { log.warn(`update_attributes: ${e.message}`) }
    })
    // Server corrections to our position are authoritative — accept them.
    c.on('move_player', p => {
      try {
        if (p.runtime_id === this.self.runtimeId) {
          this.self.pos = { x: p.position.x, y: p.position.y - 1.62, z: p.position.z }
          this.movement.clear()
        }
      } catch {}
    })
    c.on('disconnect', p => { log.warn(`disconnected: ${p?.message ?? 'unknown'}`); this.teardown(true) })
    c.on('close', () => { log.warn('connection closed'); this.teardown(true) })
    c.on('error', e => {
      // Ignore non-fatal packet read/decode errors (e.g. protodef PartialReadError on player_list)
      if (e.message && (e.message.includes('Read error') || e.message.includes('PartialReadError') || e.message.includes('Unexpected buffer end'))) {
        log.warn(`non-fatal packet decode warning: ${e.message}`)
        return
      }
      log.warn(`client error: ${e.message}`)
      this.teardown(true)
    })
  }
  startLoop() {
    if (this.loop) return
    this.loop = setInterval(() => {
      try {
        this.movement.tick()
        const inCombat = this.combat.update()
        if (!inCombat) this.miner.update()
        if (++this.tickCount % 100 === 0) this.world.unloadFar(this.self.pos, config.chunkRadius)
      } catch (e) {
        // A logic bug must never crash the connection mid-write.
        log.warn(`tick error (contained): ${e.message}`)
      }
    }, 50) // 20 tps — matching real client cadence
  }
  // Full teardown before any reconnect: clear the loop, drop listeners,
  // close the socket. Guarantees no two client instances ever coexist.
  teardown(reconnect) {
    if (this.loop) { clearInterval(this.loop); this.loop = null }
    if (this.client) {
      try { this.client.removeAllListeners() } catch {}
      try { this.client.close() } catch {}
      this.client = null
    }
    if (reconnect && !this.reconnecting) {
      this.reconnecting = true
      log.info(`reconnecting in ${config.reconnectDelayMs}ms`)
      setTimeout(() => { try { this.connect() } catch (e) { log.warn(e.message); process.exit(1) } },
        config.reconnectDelayMs)
    }
  }
}
// Fail closed at the process level: an uncaught exception mid-packet-write is
// exactly the half-open-connection scenario that corrupts state for others.
// Tear down cleanly instead of dying with the socket in an unknown state.
const bot = new Bot()
const shutdown = (signal) => {
  log.info(`shutting down (${signal})`)
  bot.teardown(false)
  process.exit(0)
}
process.on('uncaughtException', e => { log.warn(`uncaught: ${e.stack}`); bot.teardown(true) })
process.on('unhandledRejection', e => { log.warn(`unhandled rejection: ${e}`) })
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
bot.connect()
