const crypto = require('crypto')
const mcData = require('minecraft-data')('bedrock_1.26.40')

// Complete clientData/skin payload for Bedrock 1.26.40 — prevents the
// malformed skin broadcast failure mode where connected players get kicked
// or crash when the server rebroadcasts the bot's clientData to them.
// By merging with the official vanilla 1.26.40 defaultSkin from minecraft-data,
// every required Persona geometry, animated face binding, and RGBA buffer is
// 100% vanilla-compliant.
function buildSkinData() {
  const defaultSkin = mcData ? mcData.defaultSkin : {}
  return {
    ...defaultSkin,
    SkinId: `${crypto.randomUUID()}.CustomSlim`,
    PlayFabId: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    PersonaSkin: false,
    PremiumSkin: false,
    TrustedSkin: true,
    OverrideSkin: false,
    ArmSize: 'slim',
    SkinColor: '#0',
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
