const path = require("node:path");

const signRequired = process.env.DESKTOP_MAC_SIGN_REQUIRED === "true";
const hasSignIdentity = Boolean(process.env.APPLE_SIGN_IDENTITY);

const hasNotaryApiKeyAuth =
  Boolean(process.env.APPLE_API_KEY_PATH) &&
  Boolean(process.env.APPLE_API_KEY_ID) &&
  Boolean(process.env.APPLE_API_ISSUER);

if (signRequired && !hasSignIdentity) {
  throw new Error(
    "DESKTOP_MAC_SIGN_REQUIRED=true but APPLE_SIGN_IDENTITY is not set",
  );
}

if (signRequired && !hasNotaryApiKeyAuth) {
  throw new Error(
    "DESKTOP_MAC_SIGN_REQUIRED=true but notarization env vars are missing: APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER",
  );
}

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "app.shwld.tatsumaki.desktop",
    appCategoryType: "public.app-category.productivity",
    name: "tatsumaki Desktop",
    icon: path.resolve(__dirname, "assets/icon"),
    osxSign: hasSignIdentity
      ? {
          identity: process.env.APPLE_SIGN_IDENTITY,
          hardenedRuntime: true,
          keychain: process.env.APPLE_KEYCHAIN_PATH,
        }
      : undefined,
    osxNotarize: hasNotaryApiKeyAuth
      ? {
          tool: "notarytool",
          appleApiKey: process.env.APPLE_API_KEY_PATH,
          appleApiKeyId: process.env.APPLE_API_KEY_ID,
          appleApiIssuer: process.env.APPLE_API_ISSUER,
        }
      : undefined,
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        format: "ULFO",
      },
    },
  ],
};
