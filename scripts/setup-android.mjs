import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const androidDir = path.join(rootDir, 'android');
const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir });
}

if (!fs.existsSync(androidDir)) {
  console.log('Adding Capacitor Android platform...');
  run('npx cap add android');
}

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  const permissionsToEnsure = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  ];

  for (const perm of permissionsToEnsure) {
    const permNameMatch = perm.match(/android:name="([^"]+)"/);
    const permName = permNameMatch ? permNameMatch[1] : perm;
    if (!manifest.includes(permName)) {
      manifest = manifest.replace('</manifest>', `    ${perm}\n</manifest>`);
    }
  }

  if (!manifest.includes('android:usesCleartextTraffic')) {
    manifest = manifest.replace(
      '<application',
      '<application android:usesCleartextTraffic="true"'
    );
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('Updated AndroidManifest.xml with Network, Camera & Media permissions.');
}

console.log('Syncing web assets to Android project...');
run('npx cap sync android');
console.log('Capacitor Android project is ready!');
