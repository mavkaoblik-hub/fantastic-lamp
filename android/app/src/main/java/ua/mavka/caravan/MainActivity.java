package ua.mavka.caravan;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Build;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.view.DisplayCutout;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/game/index.html";
    private WebView game;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            getWindow().setStatusBarColor(Color.BLACK);
            getWindow().setNavigationBarColor(Color.BLACK);
            game = new WebView(this);
            game.setBackgroundColor(Color.rgb(8, 16, 24));
            game.setOverScrollMode(View.OVER_SCROLL_NEVER);
            WebSettings settings = game.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setSupportZoom(false);
            settings.setMediaPlaybackRequiresUserGesture(true);
            game.setWebChromeClient(new WebChromeClient() {
                @Override public boolean onConsoleMessage(ConsoleMessage msg) {
                    Log.d("CARAVAN_JS", msg.messageLevel() + " " + msg.message());
                    return true;
                }
            });
            game.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    String path = uri.getPath();
                    if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())
                            || path == null || !path.startsWith("/assets/game/")) {
                        return response(403, "Blocked");
                    }
                    String asset = path.substring("/assets/".length());
                    if (asset.contains("..") || asset.indexOf('\\') >= 0) {
                        return response(403, "Blocked");
                    }
                    try {
                        InputStream input = getAssets().open(asset);
                        return new WebResourceResponse(mime(asset), "UTF-8", input);
                    } catch (IOException ex) {
                        Log.e("CARAVAN_BOOT", "Missing game asset: " + asset, ex);
                        return response(404, "Missing asset");
                    }
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (!request.isForMainFrame()) return;
                    Log.e("CARAVAN_BOOT", "Main frame error: " + error.getDescription());
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Караван: помилка завантаження")
                        .setMessage("Не вдалося відкрити локальну ігрову сцену. Див. CARAVAN_BOOT у журналі Android.")
                        .setPositiveButton("Закрити", (d, w) -> finish()).show();
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return !HOME.equals(request.getUrl().toString());
                }
            });
            // Android 15 can draw edge-to-edge even in landscape. Reserve the
            // actual cutout/navigation insets outside the WebView viewport.
            FrameLayout viewport = new FrameLayout(this);
            viewport.setBackgroundColor(Color.rgb(8, 16, 24));
            viewport.addView(game, new FrameLayout.LayoutParams(-1, -1));
            viewport.setOnApplyWindowInsetsListener((view, insets) -> {
                int left = insets.getSystemWindowInsetLeft();
                int top = insets.getSystemWindowInsetTop();
                int right = insets.getSystemWindowInsetRight();
                int bottom = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28) {
                    DisplayCutout cutout = insets.getDisplayCutout();
                    if (cutout != null) {
                        left = Math.max(left, cutout.getSafeInsetLeft());
                        top = Math.max(top, cutout.getSafeInsetTop());
                        right = Math.max(right, cutout.getSafeInsetRight());
                        bottom = Math.max(bottom, cutout.getSafeInsetBottom());
                    }
                }
                view.setPadding(left, top, right, bottom);
                return Build.VERSION.SDK_INT >= 28
                        ? insets.consumeSystemWindowInsets().consumeDisplayCutout()
                        : insets.consumeSystemWindowInsets();
            });
            if (Build.VERSION.SDK_INT >= 28) {
                WindowManager.LayoutParams attributes = getWindow().getAttributes();
                attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                getWindow().setAttributes(attributes);
            }
            setContentView(viewport);
            immersive();
            game.loadUrl(HOME);
            Log.i("CARAVAN_BOOT", "Offline game loading");
        } catch (Throwable ex) {
            Log.e("CARAVAN_BOOT", "Native startup failure", ex);
            TextView message = new TextView(this);
            message.setText("Не вдалося запустити Караван.\n"
                    + ex.getClass().getSimpleName() + "\nДіагностика: CARAVAN_BOOT");
            message.setTextColor(Color.WHITE);
            message.setBackgroundColor(Color.rgb(11, 21, 29));
            message.setTextSize(18);
            message.setGravity(android.view.Gravity.CENTER);
            setContentView(message);
        }
    }
    private static WebResourceResponse response(int code, String text) {
        return new WebResourceResponse("text/plain", "UTF-8", code, text, null,
                new ByteArrayInputStream(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
    private static String mime(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }
    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        immersive();
        if (game != null) game.evaluateJavascript("window.dispatchEvent(new Event('resize'))", null);
    }
    @Override protected void onPause() {
        if (game != null) {
            game.evaluateJavascript("globalThis.__CARAVAN_SAVE && globalThis.__CARAVAN_SAVE()", null);
            game.onPause();
        }
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (game != null) game.onResume();
    }
    @Override public void onBackPressed() {
        if (game == null) { super.onBackPressed(); return; }
        game.evaluateJavascript("Boolean(globalThis.CaravanAndroid && globalThis.CaravanAndroid.back())", handled -> {
            if (!"true".equals(handled) && !isFinishing()) confirmExit();
        });
    }
    private void confirmExit() {
        new AlertDialog.Builder(this).setTitle("Караван")
            .setMessage("Зберегти прогрес і вийти?")
            .setNegativeButton("Продовжити", null)
            .setPositiveButton("Вийти", (d,w) ->
                game.evaluateJavascript("globalThis.__CARAVAN_SAVE && globalThis.__CARAVAN_SAVE()", v -> finish())).show();
    }
    @Override protected void onDestroy() {
        if (game != null) {
            game.destroy();
            game = null;
        }
        super.onDestroy();
    }
}
