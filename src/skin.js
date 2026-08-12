const crypto = require('crypto')
const mcData = require('minecraft-data')('bedrock_1.26.40')

// Complete Classic (non-Persona) clientData/skin payload for Bedrock 1.26.40.
// Crucial for cracked servers: when PersonaSkin is true, cracked Bedrock
// clients attempt to fetch Persona geometry from Microsoft PlayFab servers.
// Because cracked clients lack Microsoft authentication, that PlayFab lookup
// fails and crashes/kicks the connected player.
// Setting PersonaSkin: false with standard built-in geometry forces all clients
// to render the texture directly from the packet buffer without querying PlayFab.
function buildSkinData() {
  const defaultSkin = mcData ? mcData.defaultSkin : {}
  const b64 = s => Buffer.from(s).toString('base64')
  return {
    ...defaultSkin,
    SkinId: `${crypto.randomUUID()}.CustomSlim`,
    PlayFabId: '',
    PersonaSkin: false,
    PremiumSkin: false,
    TrustedSkin: true,
    OverrideSkin: false,
    ArmSize: 'slim',
    SkinColor: '#0',
    SkinResourcePatch: b64(JSON.stringify({ geometry: { default: 'geometry.humanoid.customSlim' } })),
    SkinGeometryDataEngineVersion: '', // Required empty string for Bedrock >= 1.17.30
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
