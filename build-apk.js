// Builds an installable Android APK on this PC using Android Studio's tools.
// Run by double-clicking BUILD-APK.bat (or: node build-apk.js [server-address])
// Result: PestGuard.apk in this folder. Copy it to your phone and open it to install.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const MOBILE = path.join(ROOT, 'mobile');
const WIN = process.platform === 'win32';
function fail(m) { console.error(`\n\u2716 ${m}\n`); process.exit(1); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: WIN, ...opts });
  return r.status === 0;
}

// 1. Android Studio's Java and SDK
const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const javaCandidates = [process.env.JAVA_HOME, 'C:\\Program Files\\Android\\Android Studio\\jbr', 'C:\\Program Files\\Android\\Android Studio\\jre', path.join(local, 'Programs', 'Android Studio', 'jbr')].filter(Boolean);
const sdkCandidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(local, 'Android', 'Sdk'), path.join(os.homedir(), 'Android', 'Sdk')].filter(Boolean);
const javaHome = javaCandidates.find(p => fs.existsSync(path.join(p, 'bin', WIN ? 'java.exe' : 'java')));
const sdk = sdkCandidates.find(p => fs.existsSync(path.join(p, 'platform-tools')) || fs.existsSync(path.join(p, 'platforms')));
if (!javaHome) fail('Could not find Java. Open Android Studio once (it installs its own Java), or set JAVA_HOME, then try again.');
if (!sdk) fail('Could not find the Android SDK. Open Android Studio > More Actions > SDK Manager, install the latest Android SDK, then try again.');
console.log(`Java: ${javaHome}\nAndroid SDK: ${sdk}`);

// 2. Server address baked into the app (it can still be changed on the sign-in screen)
const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
const serverUrl = process.argv[2] || (lan[0] ? `http://${lan[0]}:4000` : null);
if (!serverUrl) fail('Could not find this PC\'s Wi-Fi address. Run: node build-apk.js http://<your-pc-ip>:4000');
const appJsonPath = path.join(MOBILE, 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
appJson.expo.extra = { ...(appJson.expo.extra || {}), apiUrl: serverUrl };
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log(`Server address in the app: ${serverUrl}`);

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH}`, CI: '1' };

// 3. Install app packages
if (!fs.existsSync(path.join(MOBILE, 'node_modules'))) {
  console.log('\nInstalling app packages (first time only)...');
  if (!run(WIN ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: MOBILE, env })) fail('npm install failed. Check your internet connection.');
}

// 4. Generate the Android project and build a release APK
console.log('\nPreparing the Android project...');
if (!run(WIN ? 'npx.cmd' : 'npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], { cwd: MOBILE, env })) fail('expo prebuild failed (see above).');
fs.writeFileSync(path.join(MOBILE, 'android', 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);

console.log('\nBuilding the APK. The first build downloads a lot and can take 10-20 minutes...');
const gradlew = path.join(MOBILE, 'android', WIN ? 'gradlew.bat' : 'gradlew');
if (!run(WIN ? `"${gradlew}"` : gradlew, ['assembleRelease', '--no-daemon'], { cwd: path.join(MOBILE, 'android'), env })) {
  fail('The Android build failed (see the messages above). Common fixes: open Android Studio > SDK Manager and accept the licences / install the SDK it asks for, then run BUILD-APK again.');
}

const apk = path.join(MOBILE, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(apk)) fail('Build finished but the APK was not found.');
fs.copyFileSync(apk, path.join(ROOT, 'PestGuard.apk'));
console.log(`\n\u2714 Done: ${path.join(ROOT, 'PestGuard.apk')}`);
console.log('Copy it to your phone (WhatsApp to yourself, USB or Google Drive), open it, and allow "Install unknown apps".');
console.log(`The app connects to ${serverUrl}. Keep START.bat running on this PC, and keep the phone on the same Wi-Fi.\n`);
