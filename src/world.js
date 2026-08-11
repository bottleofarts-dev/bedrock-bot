const { Vec3 } = require('vec3')
const log = require('./log')
const config = require('./config')
class World {
  constructor(registry) {
    // Prevent prismarine-chunk from failing on newer Bedrock major versions
    // (like 1.26) by mapping the chunk version lookup to the modern 1.21/1.18
    // 3D chunk format.
    const pcRegistry = Object.create(registry)
    if (registry.version && registry.version.type === 'bedrock') {
      pcRegistry.version = { ...registry.version, majorVersion: '1.21' }
    }
    this.ChunkColumn = require('prismarine-chunk')(pcRegistry)
    this.columns = new Map()        // 'cx,cz' -> ChunkColumn
    this.overrides = new Map()      // 'x,y,z' -> block name (local updates, e.g. mined blocks)
    this.resources = new Map()      // 'x,y,z' -> { pos, name }
    this.chunkResources = new Map() // 'cx,cz' -> Set of resource keys (for clean unload)
    this.wanted = new Set(config.wantedBlocks)
  }
  ckey = (cx, cz) => `${cx},${cz}`
  bkey = p => `${p.x},${p.y},${p.z}`
  handleLevelChunk(packet) {
    try {
      const cc = new this.ChunkColumn({ x: packet.x, z: packet.z })
      this.columns.set(this.ckey(packet.x, packet.z), cc)
      if (packet.sub_chunk_count < 0) {
        // Server uses the sub_chunk request flow — data arrives via handleSubChunk.
        return { needsSubChunks: true }
      }
      cc.networkDecodeNoCache(packet.payload, packet.sub_chunk_count)
      this.scanColumn(cc, packet.x, packet.z)
      return { needsSubChunks: false }
    } catch (e) {
      // Fail closed: an unparseable chunk is treated as unknown terrain.
      log.warn(`chunk decode failed ${packet.x},${packet.z}: ${e.message}`)
      return { needsSubChunks: false }
    }
  }
  async handleSubChunk(packet) {
    try {
      for (const entry of packet.entries ?? []) {
        if (entry.result && entry.result !== 'success') continue
        const cx = packet.origin.x + entry.dx
        const cz = packet.origin.z + entry.dz
        const cy = packet.origin.y + entry.dy
        const cc = this.columns.get(this.ckey(cx, cz))
        if (!cc) continue
        await cc.networkDecodeSubChunkNoCache(cy, entry.payload)
        this.scanColumn(cc, cx, cz, cy * 16, cy * 16 + 15)
      }
    } catch (e) {
      log.warn(`sub_chunk decode failed: ${e.message}`)
    }
  }
  blockAt(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z)
    const override = this.overrides.get(`${x},${y},${z}`)
    if (override) return override
    const cc = this.columns.get(this.ckey(Math.floor(x / 16), Math.floor(z / 16)))
    if (!cc) return null // unknown terrain — pathfinder treats null as impassable
    try {
      const b = cc.getBlock(new Vec3(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16))
      return b ? b.name : null
    } catch { return null }
  }
  scanColumn(cc, cx, cz, yMin = config.scanMinY, yMax = config.scanMaxY) {
    const set = this.chunkResources.get(this.ckey(cx, cz)) ?? new Set()
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++)
      for (let y = yMin; y <= yMax; y++) {
        let name
        try { name = cc.getBlock(new Vec3(x, y, z))?.name } catch { continue }
        if (!name || !this.wanted.has(name)) continue
        const pos = { x: cx * 16 + x, y, z: cz * 16 + z }
        const key = this.bkey(pos)
        this.resources.set(key, { pos, name })
        set.add(key)
      }
    if (set.size) this.chunkResources.set(this.ckey(cx, cz), set)
  }
  applyBlockUpdate(pos, isAirNow) {
    const key = this.bkey(pos)
    if (isAirNow) this.overrides.set(key, 'minecraft:air')
    this.resources.delete(key)
  }
  // Mirror real-client behavior: don't hold chunk data forever.
  unloadFar(botPos, radiusChunks) {
    const bx = Math.floor(botPos.x / 16), bz = Math.floor(botPos.z / 16)
    for (const key of this.columns.keys()) {
      const [cx, cz] = key.split(',').map(Number)
      if (Math.max(Math.abs(cx - bx), Math.abs(cz - bz)) <= radiusChunks + 2) continue
      this.columns.delete(key)
      const res = this.chunkResources.get(key)
      if (res) { for (const k of res) this.resources.delete(k) }
      this.chunkResources.delete(key)
    }
  }
  nearestResource(pos, wantedList) {
    const wanted = new Set(wantedList)
    let best = null, bestD = Infinity
    for (const r of this.resources.values()) {
      if (!wanted.has(r.name)) continue
      const d = (r.pos.x - pos.x) ** 2 + (r.pos.y - pos.y) ** 2 + (r.pos.z - pos.z) ** 2
      if (d < bestD) { bestD = d; best = r }
    }
    return best
  }
}
module.exports = World
