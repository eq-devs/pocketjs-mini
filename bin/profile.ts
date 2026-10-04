// A Mini-owned host contract; upstream's transitional ios-dev remains untouched.
export interface WindowInfo {
  width: number; height: number; density: number;
  safeTop: number; safeBottom: number; safeLeft: number; safeRight: number;
}
export const defaultWindow: WindowInfo = {
  width: 390, height: 844, density: 1,
  safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0,
};
export function readWindow(value: any): WindowInfo {
  const result = Object.fromEntries(Object.keys(defaultWindow).map(key => [key, value?.[key]])) as unknown as WindowInfo;
  if (![result.width, result.height].every(n => Number.isInteger(n) && n >= 100 && n <= 1024)
      || !Number.isInteger(result.density) || result.density < 1 || result.density > 4
      || ![result.safeTop, result.safeBottom, result.safeLeft, result.safeRight].every(n => Number.isFinite(n) && n >= 0 && n <= 200))
    throw new Error("Invalid native window metrics (100..1024 logical units, density 1..4)");
  return result;
}
export function miniContracts(platforms: any, window: WindowInfo, platform: "ios" | "android" = "ios") {
  return platforms.definePlatformContractRegistry(platforms.POCKET_CAPABILITIES,
    platforms.defineTargetRegistry({ [`pjm-${platform}`]: {
      hostAbi: 7, platform, form: "takeover",
      display: {
        physicalViewport: [window.width * window.density, window.height * window.density],
        logicalViewports: [[window.width, window.height]],
        presentations: ["native"], rasterDensity: window.density,
      },
      capabilities: ["input.touch", "text.glyphs.baked"],
    } }));
}
