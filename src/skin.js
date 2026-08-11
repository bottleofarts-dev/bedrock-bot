const crypto = require('crypto')
// Complete clientData/skin payload — the leading suspect for "other players
// get kicked when the bot joins." The server rebroadcasts this to every
// client; an incomplete payload can crash THEIR parsers while the bot stays
// connected. Every field a real Win10 client sends is populated.
//
// STRONGLY RECOMMENDED: capture a real client's login on your exact game
// version with a MITM proxy (e.g. pakkit) and replace these values with the
// captured ones. The defaults below are valid and conservative, but a
// captured payload is ground truth.
function buildSkinData() {
  // Fully opaque 64x64 RGBA image — no zero-length or transparent-hole data.
  const px = Buffer.alloc(64 * 64 * 4)
  for (let i = 0; i < px.length; i += 4) { px[i] = 120; px[i + 1] = 104; px[i + 2] = 86; px[i + 3] = 255 }
  const b64 = s => Buffer.from(s).toString('base64')
  return {
    SkinId: `${crypto.randomUUID()}.CustomSlim`,
    PlayFabId: '',
    SkinResourcePatch: b64(JSON.stringify({ geometry: { default: 'geometry.humanoid.customSlim' } })),
    SkinImageWidth: 64,
    SkinImageHeight: 64,
    SkinData: px.toString('base64'),
    SkinGeometryData: b64('null'), // what vanilla sends when using built-in geometry
    SkinGeometryDataEngineVersion: b64('1.14.0'),
    SkinAnimationData: '',
    AnimatedImageData: [],
    PersonaPieces: [],
    PieceTintColors: [],
    PersonaSkin: false,
    PremiumSkin: false,
    CapeData: '',
    CapeId: '',
    CapeImageWidth: 0,
    CapeImageHeight: 0,
    CapeOnClassicSkin: false,
    ArmSize: 'slim',
    SkinColor: '#0',
    TrustedSkin: true,
    OverrideSkin: false,
    DeviceId: crypto.randomUUID(),
    DeviceModel: 'PC',
    DeviceOS: 7,          // Windows 10
    DefaultInputMode: 1,  // keyboard/mouse
    CurrentInputMode: 1,
    UIProfile: 0,
    GuiScale: 0,
    LanguageCode: 'en_US',
    PlatformOfflineId: '',
    PlatformOnlineId: '',
    SelfSignedId: crypto.randomUUID(),
    ThirdPartyName: '',
    ThirdPartyNameOnly: false,
    IsEditorMode: false,
    CompatibleWithClientSideChunkGen: false,
  }
}
module.exports = { buildSkinData }
