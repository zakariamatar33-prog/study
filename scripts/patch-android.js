// يُشغَّل تلقائيًا داخل GitHub Actions بعد "npx cap add android" و"npx cap sync android".
// 1) يضيف صلاحيات الخلفية + يربط Google Services بمشروع Gradle.
// 2) يضيف خدمة Foreground Service حقيقية تستخدم محرك النطق الأصلي لأندرويد
//    (TextToSpeech) بدل speechSynthesis في الـ WebView، عشان الصوت يفضل
//    شغال حتى لو اتقفلت الشاشة أو اتصغّر التطبيق.
// 3) يحقن سكريبت JS بسيط في نسخة الموقع المبنية يحوّل نداءات speechSynthesis
//    تلقائيًا للخدمة الأصلية لما التطبيق يشتغل داخل Capacitor.
const fs = require('fs');
const path = require('path');

function getAppId(){
  const cfg = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
  if(!cfg.appId) throw new Error('appId غير موجود في capacitor.config.json');
  return cfg.appId;
}

function pkgDir(appId){
  return path.join('android', 'app', 'src', 'main', 'java', ...appId.split('.'));
}

function patchManifest(){
  const p = 'android/app/src/main/AndroidManifest.xml';
  let xml = fs.readFileSync(p, 'utf8');
  if(!xml.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK')){
    const additions =
`    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <queries>
        <package android:name="com.google.android.gms" />
    </queries>
`;
    xml = xml.replace('<application', additions + '\n    <application');
    console.log('Manifest permissions patched.');
  } else {
    console.log('Manifest permissions already patched.');
  }

  if(!xml.includes('TtsForegroundService')){
    const serviceTag =
`        <service
            android:name=".TtsForegroundService"
            android:foregroundServiceType="mediaPlayback"
            android:exported="false" />
`;
    xml = xml.replace('</application>', serviceTag + '    </application>');
    console.log('Service declaration added to manifest.');
  } else {
    console.log('Service already declared in manifest.');
  }

  fs.writeFileSync(p, xml);
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
  if(!g.includes('com.google.gms.google-services')){
    g += "\napply plugin: 'com.google.gms.google-services'\n";
    console.log('App build.gradle plugin applied.');
  }
  fs.writeFileSync(p, g);
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

function writeTtsService(appId){
  const dir = pkgDir(appId);
  const p = path.join(dir, 'TtsForegroundService.java');
  const content =
`package ${appId};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import androidx.core.app.NotificationCompat;

import java.util.Locale;
import java.util.UUID;

public class TtsForegroundService extends Service {

    public static final String CHANNEL_ID = "tts_playback_channel";
    public static final int NOTIFICATION_ID = 4242;

    private TextToSpeech tts;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.JAPANESE);
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());

        if (intent != null && "STOP".equals(intent.getAction())) {
            stopSpeaking();
            return START_NOT_STICKY;
        }

        if (intent != null && intent.hasExtra("text")) {
            String text = intent.getStringExtra("text");
            String lang = intent.getStringExtra("lang");
            speak(text, lang);
        }
        return START_STICKY;
    }

    private void speak(String text, String lang) {
        if (tts == null || text == null || text.isEmpty()) return;
        if (lang != null && !lang.isEmpty()) {
            try { tts.setLanguage(Locale.forLanguageTag(lang)); } catch (Exception ignored) {}
        }
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, UUID.randomUUID().toString());
    }

    private void stopSpeaking() {
        if (tts != null) tts.stop();
        stopForeground(true);
        stopSelf();
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("جارِ القراءة")
                .setContentText("النطق يعمل بالخلفية")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "قراءة الجمل", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        super.onDestroy();
    }
}
`;
  fs.writeFileSync(p, content);
  console.log('TtsForegroundService.java written.');
}

function writeTtsPlugin(appId){
  const dir = pkgDir(appId);
  const p = path.join(dir, 'TtsPlugin.java');
  const content =
`package ${appId};

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TtsPlugin")
public class TtsPlugin extends Plugin {

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        String lang = call.getString("lang", "ja-JP");
        Intent intent = new Intent(getContext(), TtsForegroundService.class);
        intent.putExtra("text", text);
        intent.putExtra("lang", lang);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), TtsForegroundService.class);
        intent.setAction("STOP");
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {}
        call.resolve();
    }
}
`;
  fs.writeFileSync(p, content);
  console.log('TtsPlugin.java written.');
}

function patchMainActivity(appId){
  const p = path.join(pkgDir(appId), 'MainActivity.java');
  let j = fs.readFileSync(p, 'utf8');
  if(j.includes('registerPlugin(TtsPlugin.class)')){
    console.log('MainActivity already patched.');
    return;
  }
  const newContent =
`package ${appId};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  fs.writeFileSync(p, newContent);
  console.log('MainActivity.java patched.');
}

function patchWebAssets(){
  const candidates = [
    'android/app/src/main/assets/public/index.html'
  ];
  const p = candidates.find(f => fs.existsSync(f));
  if(!p){
    console.log('تحذير: لم يتم العثور على index.html داخل assets، لم يتم حقن shim النطق.');
    return;
  }
  let html = fs.readFileSync(p, 'utf8');
  if(html.includes('__NATIVE_TTS_SHIM__')){
    console.log('Web TTS shim already injected.');
    return;
  }
  const shim =
`<script>/*__NATIVE_TTS_SHIM__*/
(function(){
  function ready(fn){
    if (window.Capacitor) fn();
    else document.addEventListener('deviceready', fn, false);
  }
  ready(function(){
    if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;
    var TtsPlugin = window.Capacitor.Plugins && window.Capacitor.Plugins.TtsPlugin;
    if (!TtsPlugin) return;
    window.speechSynthesis.speak = function(utterance){
      TtsPlugin.speak({ text: utterance.text, lang: utterance.lang || 'ja-JP' });
    };
    window.speechSynthesis.cancel = function(){ TtsPlugin.stop(); };
    window.__requestBackgroundAudioPermission = function(){
      TtsPlugin.requestIgnoreBatteryOptimizations();
    };
  });
})();
</script>
`;
  html = html.replace('<head>', '<head>\n' + shim);
  fs.writeFileSync(p, html);
  console.log('Web TTS shim injected into index.html.');
}

const appId = getAppId();
patchManifest();
patchTopBuildGradle();
patchAppBuildGradle();
patchReleaseSigning();
writeTtsService(appId);
writeTtsPlugin(appId);
patchMainActivity(appId);
patchWebAssets();
