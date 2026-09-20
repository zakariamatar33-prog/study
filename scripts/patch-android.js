// يُشغَّل تلقائيًا داخل GitHub Actions بعد "npx cap add android".
// يضيف الصلاحيات اللازمة لاستمرار الصوت بالخلفية، ويربط إضافة
// Google Services بمشروع Gradle حتى يشتغل تسجيل الدخول الأصلي بجوجل.
const fs = require('fs');

function patchManifest(){
  const p = 'android/app/src/main/AndroidManifest.xml';
  let xml = fs.readFileSync(p, 'utf8');
  if(xml.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK')){
    console.log('Manifest already patched.');
    return;
  }
  const additions =
`    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <queries>
        <package android:name="com.google.android.gms" />
    </queries>
`;
  xml = xml.replace('<application', additions + '\n    <application');
  fs.writeFileSync(p, xml);
  console.log('Manifest patched.');
}

function patchTopBuildGradle(){
  const p = 'android/build.gradle';
  let g = fs.readFileSync(p, 'utf8');
  if(g.includes('com.google.gms:google-services')){
    console.log('Top build.gradle already patched.');
    return;
  }
  g = g.replace('dependencies {', "dependencies {\n        classpath 'com.google.gms:google-services:4.4.2'");
  fs.writeFileSync(p, g);
  console.log('Top build.gradle patched.');
}

function patchAppBuildGradle(){
  const p = 'android/app/build.gradle';
  let g = fs.readFileSync(p, 'utf8');
  if(g.includes('com.google.gms.google-services')){
    console.log('App build.gradle already patched.');
    return;
  }
  g += "\napply plugin: 'com.google.gms.google-services'\n";
  fs.writeFileSync(p, g);
  console.log('App build.gradle patched.');
}

function patchReleaseSigning(){
  const p = 'android/app/build.gradle';
  let g = fs.readFileSync(p, 'utf8');
  if(g.includes('keystorePropertiesFile')){
    console.log('Release signing already patched.');
    return;
  }
  const propsLoader =
`def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

`;
  g = propsLoader + g;

  g = g.replace('android {', `android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }`);

  g = g.replace(/release\s*\{\s*\n(\s*)minifyEnabled/, function(match, indent){
    return 'release {\n' + indent + 'signingConfig signingConfigs.release\n' + indent + 'minifyEnabled';
  });

  fs.writeFileSync(p, g);
  console.log('Release signing patched.');
}

patchManifest();
patchTopBuildGradle();
patchAppBuildGradle();
patchReleaseSigning();
