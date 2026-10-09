import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Two Xcode targets: a plain UIKit app and its actual input/rotation UI tests.
export function writeNativeProject(directory: string, upstream: string, library: string, url: string, test: boolean, bundle = "dev.pjm.host", installed = false) {
  mkdirSync(join(directory, "Mini.xcodeproj/xcshareddata/xcschemes"), { recursive: true });
  const q = (value: string) => JSON.stringify(value);
  const configuration = installed ? "Release" : "Debug";
  const text = `// !$*UTF8*$!
{
 archiveVersion = 1; classes = {}; objectVersion = 56;
 objects = {
  A001 = {isa = PBXProject; buildConfigurationList = A020; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = A002; productRefGroup = A003; projectDirPath = ""; projectRoot = ""; targets = (A010, A011); attributes = {LastUpgradeCheck = 1640; TargetAttributes = {A011 = {TestTargetID = A010; }; }; }; };
  A002 = {isa = PBXGroup; children = (A004, A005, A006, A007, A054, A056, A058, A065, A067, A069, A071, A073, A075, A077, A088, A090, A092, ${installed ? "A080, A082, A084, A086," : ""} A003); sourceTree = "<group>"; };
  A003 = {isa = PBXGroup; name = Products; children = (A008, A009); sourceTree = "<group>"; };
  A004 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = main.m; sourceTree = "<group>"; };
  A005 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = PocketSurfaceView.m; sourceTree = "<group>"; };
  A006 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = Tests.swift; sourceTree = "<group>"; };
  A007 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = TestConfig.swift; sourceTree = "<group>"; };
  A054 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = AppStorage.m; sourceTree = "<group>"; };
  A055 = {isa = PBXBuildFile; fileRef = A054; };
  A056 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MetalPresenter.swift; sourceTree = "<group>"; };
  A057 = {isa = PBXBuildFile; fileRef = A056; };
  A058 = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = PackageVerifier.swift; sourceTree = "<group>"; };
  A059 = {isa = PBXBuildFile; fileRef = A058; };
  A065 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = VerifiedPackage.m; sourceTree = "<group>"; };
  A066 = {isa = PBXBuildFile; fileRef = A065; };
  A067 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = VerifiedContainer.m; sourceTree = "<group>"; };
  A068 = {isa = PBXBuildFile; fileRef = A067; };
  A069 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = PackageStore.m; sourceTree = "<group>"; };
  A070 = {isa = PBXBuildFile; fileRef = A069; };
  A071 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = InstalledController.m; sourceTree = "<group>"; };
  A072 = {isa = PBXBuildFile; fileRef = A071; };
  A073 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = DirectMetalRenderer.m; sourceTree = "<group>"; };
  A074 = {isa = PBXBuildFile; fileRef = A073; };
  A075 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = GpuResourceBudget.m; sourceTree = "<group>"; };
  A076 = {isa = PBXBuildFile; fileRef = A075; };
  A077 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = VerifiedLocation.m; sourceTree = "<group>"; };
  A078 = {isa = PBXBuildFile; fileRef = A077; };
  A088 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = VerifiedNetwork.m; sourceTree = "<group>"; };
  A089 = {isa = PBXBuildFile; fileRef = A088; };
  A090 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = MediaImage.m; sourceTree = "<group>"; };
  A091 = {isa = PBXBuildFile; fileRef = A090; };
  A092 = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.objc; path = VerifiedMedia.m; sourceTree = "<group>"; };
  A093 = {isa = PBXBuildFile; fileRef = A092; };
  ${installed ? ["main.pocket", "manifest.json", "publisher.key", "app.id"].map((path,index)=>{
    const id=80+index*2;
    return `A0${id} = {isa = PBXFileReference; lastKnownFileType = file; path = ${q(path)}; sourceTree = "<group>"; };\n  A0${id+1} = {isa = PBXBuildFile; fileRef = A0${id}; };`;
  }).join("\n  ") : ""}
  A008 = {isa = PBXFileReference; explicitFileType = wrapper.application; path = Mini.app; sourceTree = BUILT_PRODUCTS_DIR; };
  A009 = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = MiniTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
  A010 = {isa = PBXNativeTarget; name = Mini; productName = Mini; productReference = A008; productType = "com.apple.product-type.application"; buildConfigurationList = A021; buildPhases = (A030, A032, A034); buildRules = (); dependencies = (); };
  A011 = {isa = PBXNativeTarget; name = MiniTests; productName = MiniTests; productReference = A009; productType = "com.apple.product-type.bundle.ui-testing"; buildConfigurationList = A022; buildPhases = (A031, A033, A035); buildRules = (); dependencies = (A040); };
  A040 = {isa = PBXTargetDependency; target = A010; targetProxy = A041; };
  A041 = {isa = PBXContainerItemProxy; containerPortal = A001; proxyType = 1; remoteGlobalIDString = A010; remoteInfo = Mini; };
  A030 = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (A050, A051, A055, A057, A059, A066, A068, A070, A072, A074, A076, A078, A089, A091, A093); runOnlyForDeploymentPostprocessing = 0; };
  A031 = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (A052, A053); runOnlyForDeploymentPostprocessing = 0; };
  A032 = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
  A033 = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
  A034 = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (${installed ? "A081, A083, A085, A087" : ""}); runOnlyForDeploymentPostprocessing = 0; };
  A035 = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
  A050 = {isa = PBXBuildFile; fileRef = A004; };
  A051 = {isa = PBXBuildFile; fileRef = A005; };
  A052 = {isa = PBXBuildFile; fileRef = A006; };
  A053 = {isa = PBXBuildFile; fileRef = A007; };
  A020 = {isa = XCConfigurationList; buildConfigurations = (A060); defaultConfigurationIsVisible = 0; defaultConfigurationName = ${configuration}; };
  A021 = {isa = XCConfigurationList; buildConfigurations = (A061); defaultConfigurationIsVisible = 0; defaultConfigurationName = ${configuration}; };
  A022 = {isa = XCConfigurationList; buildConfigurations = (A062); defaultConfigurationIsVisible = 0; defaultConfigurationName = ${configuration}; };
  A060 = {isa = XCBuildConfiguration; name = ${configuration}; buildSettings = {SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 16.0; CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; CODE_SIGNING_ALLOWED = NO; ONLY_ACTIVE_ARCH = YES; GCC_OPTIMIZATION_LEVEL = 1; }; };
  A061 = {isa = XCBuildConfiguration; name = ${configuration}; buildSettings = {
   PRODUCT_BUNDLE_IDENTIFIER = ${q(bundle)}; PRODUCT_NAME = Mini; INFOPLIST_FILE = Info.plist; SWIFT_VERSION = 5.0; DEFINES_MODULE = YES; PRODUCT_MODULE_NAME = Mini;
   TARGETED_DEVICE_FAMILY = 1; HEADER_SEARCH_PATHS = ("$(PROJECT_DIR)");
   OTHER_LDFLAGS = ("$(inherited)", ${q(library)}, "-framework", UIKit, "-framework", Foundation, "-framework", QuartzCore, "-framework", CoreGraphics, "-framework", CoreLocation, "-framework", Network, "-framework", ImageIO, "-framework", PhotosUI, "-framework", AVFoundation, "-framework", Metal, "-lc++");
  }; };
  A062 = {isa = XCBuildConfiguration; name = ${configuration}; buildSettings = {
   PRODUCT_BUNDLE_IDENTIFIER = dev.pjm.tests; PRODUCT_NAME = MiniTests; GENERATE_INFOPLIST_FILE = YES;
   TEST_TARGET_NAME = Mini; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = 1;
  }; };
 };
 rootObject = A001;
}
`;
  writeFileSync(join(directory, "Mini.xcodeproj/project.pbxproj"), text);
  writeFileSync(join(directory, "Config.h"), `#define PJM_DEVELOPMENT_MODE ${installed ? 0 : 1}\n#define PJM_DEFAULT_URL ${q(installed ? "" : url)}\n#define PJM_TEST_MODE ${test ? 1 : 0}\n`);
  writeFileSync(join(directory, "TestConfig.swift"), `let pjmTestURL = ${q(url)}\n`);
  writeFileSync(join(directory, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Mini</string><key>CFBundleIdentifier</key><string>${bundle}</string>
<key>CFBundleName</key><string>PocketJS Mini</string><key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.3.0</string><key>CFBundleVersion</key><string>1</string>
<key>MinimumOSVersion</key><string>16.0</string><key>LSRequiresIPhoneOS</key><true/>
<key>UILaunchScreen</key><dict/>
<key>UIApplicationSceneManifest</key><dict>
<key>UIApplicationSupportsMultipleScenes</key><false/>
<key>UISceneConfigurations</key><dict><key>UIWindowSceneSessionRoleApplication</key><array><dict>
<key>UISceneConfigurationName</key><string>Mini</string><key>UISceneDelegateClassName</key><string>MiniScene</string>
</dict></array></dict></dict>
<key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
<key>NSCameraUsageDescription</key><string>Capture an image for a signed mini app after you approve access.</string>
<key>NSLocationWhenInUseUsageDescription</key><string>Allow a signed mini app to request your location after you approve access.</string>
${installed ? "" : "<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>\n<key>NSLocalNetworkUsageDescription</key><string>Connect to your Mac to run and reload your PocketJS project.</string>"}
</dict></plist>`);
  writeFileSync(join(directory, "Mini.xcodeproj/xcshareddata/xcschemes/Mini.xcscheme"), `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1640" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
<BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="${installed ? "YES" : "NO"}" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="A010" BuildableName="Mini.app" BlueprintName="Mini" ReferencedContainer="container:Mini.xcodeproj"/></BuildActionEntry>
</BuildActionEntries></BuildAction>
<TestAction buildConfiguration="${configuration}" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="A011" BuildableName="MiniTests.xctest" BlueprintName="MiniTests" ReferencedContainer="container:Mini.xcodeproj"/></TestableReference></Testables></TestAction>
${installed ? '<ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>' : ""}
<LaunchAction buildConfiguration="${configuration}" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="A010" BuildableName="Mini.app" BlueprintName="Mini" ReferencedContainer="container:Mini.xcodeproj"/></BuildableProductRunnable></LaunchAction>
</Scheme>`);
}
