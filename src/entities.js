const HOSTILE = new Set([
  'zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray',
  'creeper', 'spider', 'cave_spider', 'witch', 'enderman', 'pillager',
  'vindicator', 'phantom', 'slime', 'silverfish',
].map(n => 'minecraft:' + n))
class Entities {
  constructor() {
    this.mobs = new Map()   // runtime_id -> { id, type, pos, hostile }
    this.items = new Map()  // runtime_id -> pos (dropped items)
  }
  add(p) {
    this.mobs.set(p.runtime_id, {
      id: p.runtime_id, type: p.entity_type,
      pos: { ...p.position }, hostile: HOSTILE.has(p.entity_type),
    })
  }
  addItem(p) { this.items.set(p.runtime_id, { ...p.position }) }
  remove(id) { this.mobs.delete(id); this.items.delete(id) }
  moveAbs(p) {
    const e = this.mobs.get(p.runtime_id ?? p.runtime_entity_id)
    if (e && p.position) e.pos = { ...p.position }
  }
  moveDelta(p) {
    const e = this.mobs.get(p.runtime_entity_id)
    if (!e) return
    for (const axis of ['x', 'y', 'z']) if (typeof p[axis] === 'number') e.pos[axis] = p[axis]
  }
  #nearest(map, pos, radius, filter) {
    let best = null, bestD = radius * radius
    for (const e of map.values()) {
      const target = e.pos ?? e
      if (filter && !filter(e)) continue
      const d = (target.x - pos.x) ** 2 + (target.y - pos.y) ** 2 + (target.z - pos.z) ** 2
      if (d <= bestD) { bestD = d; best = e }
    }
    return best
  }
  nearestHostile(pos, radius) { return this.#nearest(this.mobs, pos, radius, e => e.hostile) }
  nearestItem(pos, radius) { return this.#nearest(this.items, pos, radius) }
}
module.exports = Entities
