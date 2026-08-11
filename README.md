# Bedrock Bot: Safe, Protocol-Pinned Autonomous Miner & Fighter

An autonomous Minecraft Bedrock Edition bot engineered from the ground up to eliminate the two primary failure modes that cause other connected players to be kicked from servers: **protocol version mismatch** and **malformed `clientData` / skin broadcasts**.

---

## 1. Addressing the Two Critical Failure Modes

### Failure Mode 1: Protocol Mismatch & Half-Open Connections
* **The Problem:** Many bot implementations rely on auto-negotiation or loose semver dependencies (`^3.x.x`). When a server updates or uses a different minor protocol version, malformed packets or unhandled lifecycle packets can put the socket into a half-open or desynchronized state, causing the server to kick existing clients or crash player threads.
* **The Structural Fix:**
  * **Exact Dependency Pinning:** Dependencies in `package.json` are pinned without wildcards or carets (`"bedrock-protocol": "3.44.0"`).
  * **No Auto-Detection:** Protocol version auto-detection is explicitly disabled. The bot requires setting `MC_PROTOCOL_VERSION` in `.env`, obtained by running `npm run ping`.
  * **Single Choke Point (`PacketGate`):** All outbound network traffic flows exclusively through `src/packetSafety.js`. Before a packet is queued, `client.serializer.createPacketBuffer()` validates the payload against the pinned protocol schema. Any mismatch is dropped and logged rather than sent to the server.
  * **Real-Client Cadence:** Outbound packets are rate-limited globally (default `40/s`) and per-type (e.g., `move_player` at `50ms`, `inventory_transaction` at `100ms`) to match a vanilla 20 TPS Bedrock client.

### Failure Mode 2: Malformed Skin & `clientData` Broadcast
* **The Problem:** When a client joins a Bedrock server, its `clientData` payload is broadcast to every currently connected player. Incomplete payloads, zero-length arrays, or missing Windows 10 client fields (such as `SkinResourcePatch` or `SkinGeometryDataEngineVersion`) can crash the parsers of vanilla clients, kicking other players while the bot appears to stay connected.
* **The Structural Fix:**
  * **Complete Windows 10 `clientData` Payload:** `src/skin.js` (`buildSkinData()`) constructs a complete, valid Windows 10 (`DeviceOS: 7`) RGBA 64x64 skin payload with zero holes, fully populated UUIDs, and proper base64 geometry strings.

---

## 2. Project Architecture & File Layout

```
bedrock-bot/
├── package.json         # Exact-pinned dependencies (bedrock-protocol@3.44.0)
├── .env.example         # Environment template with explicit MC_PROTOCOL_VERSION
├── scripts/
│   └── ping.js          # Pre-flight ping script to discover server protocol
└── src/
    ├── config.js        # Environment loader with fast-fail validation
    ├── log.js           # Timestamped console & packets.log writer
    ├── packetSafety.js  # PacketGate: schema validation & per-type rate limiting
    ├── skin.js          # Full Windows 10 clientData/skin payload generator
    ├── world.js         # Column/sub-chunk decode, block lookup, resource indexer
    ├── entities.js      # Hostile mob & dropped item tracking
    ├── pathfinder.js    # A* pathfinding with hazard/drowning avoidance
    ├── movement.js      # 20 TPS movement emitter (move_player / player_auth_input)
    ├── miner.js         # Mining & item-pickup state machine
    ├── combat.js        # Combat & low-health flee state machine
    └── index.js         # Connection lifecycle, event wiring, and clean teardown
```

---

## 3. Pre-Flight & Validation Procedure

### Step 1: Discover and Pin Protocol Version
Do not guess the server protocol version. Run the ping script against your target server:

```bash
cp .env.example .env
# Edit .env with your SERVER_HOST and SERVER_PORT
npm run ping
```

1. Check the reported `Server version` and `Protocol number`.
2. Set `MC_PROTOCOL_VERSION` in `.env` to the exact version string returned.
3. Confirm that the pinned release of `bedrock-protocol` explicitly supports that protocol version.

### Step 2: Live Validation Test
1. **Connect a Real Vanilla Client First:** Join the server using a standard game client.
2. **Start the Bot:** Run `npm start`. Watch the vanilla client at the exact moment the bot joins—when the server broadcasts the player list and `clientData`. The vanilla client should experience zero lag or errors.
3. **Soak Test (15+ Minutes):** Let the bot idle, navigate, mine, and fight alongside the real client for at least 15 minutes.
4. **Audit Logs:** Every outbound packet and lifecycle event is recorded in `packets.log` with precise timestamps:
   ```
   2026-08-11T03:00:00.000Z OUT request_chunk_radius
   2026-08-11T03:00:01.000Z OUT move_player
   ```
   If any player ever disconnects during testing, cross-reference the exact timestamp in `packets.log` with the server console log.
5. **Clean Shutdown:** Press `Ctrl+C`. Confirm in the server log that the bot disconnects cleanly without leaving ghost entities or half-open sockets.

---

## 4. Known Protocol Variations & Extension Points

* **Movement Authority (`player_auth_input` vs `move_player`):**  
  In `src/movement.js`, the bot inspects `start_game` for server-authoritative movement. Field names in `player_auth_input` shift slightly across Bedrock minor releases. If the bot connects but drops movement packets, inspect `packets.log` for `(schema validation failed)` and adjust the field names in `sendPosition()` to match your pinned protocol version's schema.
* **Sub-Chunk Request Flow:**  
  If your server uses sub-chunk requesting (`packet.sub_chunk_count < 0` in `level_chunk`), `src/index.js` logs: `chunk X,Z requires sub_chunk request flow`. Implement the version-specific `subchunk_request` packet emission at that marked extension point.
* **Resource Pack Handshake:**  
  `bedrock-protocol` auto-responds to resource pack packets during login. The handshake steps are logged in `src/index.js` (`resource_packs_info` → `resource_pack_stack`).

---

## 5. Railway Deployment Guide (`railway.app`)

The codebase is configured for seamless deployment as a background worker on Railway:

1. **`SIGTERM` Graceful Shutdown (`src/index.js`)**: Railway sends `SIGTERM` when restarting or redeploying containers. The bot handles `SIGTERM` explicitly to invoke `bot.teardown(false)` and close the socket cleanly so it never leaves ghost players or half-open connections on your Minecraft server.
2. **Node.js Engine Pin (`package.json`)**: Configured with `"engines": { "node": ">=18.0.0" }` so Railway's Nixpacks builder automatically provisions Node.js 18+ (required for `crypto.randomUUID()`, `BigInt`, and ES private class methods).
3. **Automatic Environment Variables (`.env`)**:
   * We removed `.env` from `.gitignore` so that Railway **automatically loads** your exact configuration directly from your GitHub repository when deployed—**no manual data entry required in the Railway Dashboard!**
   * Pre-configured values loaded automatically:
     * `SERVER_HOST=Mrak980.aternos.me`
     * `SERVER_PORT=56850`
     * `BOT_USERNAME=MinerBot`
     * `MC_PROTOCOL_VERSION=1.26.40`
     * `OFFLINE_MODE=true` *(cracked mode enabled)*
     * `LOG_PACKETS_TO_CONSOLE=true` *(streams packet logs to Railway's **Deployments → Logs** viewer)*
4. **Cracked Server / Offline Mode Login (`OFFLINE_MODE=true`)**:
   * Because your server is cracked, the bot will bypass Microsoft/Xbox Live authentication entirely and join immediately upon starting.
5. **No Public Networking Domain Needed**: Do **not** generate a public domain/HTTP route in Railway. Railway will automatically run `node src/index.js` as a background worker process.


