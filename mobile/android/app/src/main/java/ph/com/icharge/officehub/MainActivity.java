package ph.com.icharge.officehub;

import android.Manifest;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebBackForwardList;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.Collections;
import org.json.JSONObject;

/**
 * Office Hub for Android: the live Office Hub website in the app's own window (always in sync with the website),
 * plus what a phone app adds: camera and location for Time in, downloads, phone alerts, back button, offline page.
 */
public class MainActivity extends BridgeActivity {

    static final String HOST = "icharge-office-hub.vercel.app";
    static final String ORIGIN = "https://" + HOST;
    static final String HOME = ORIGIN + "/today";
    static final String CHANNEL = "officehub";

    private JavaScriptReplyProxy pageReply;
    private final ActivityResultLauncher<String> askNotifications = registerForActivityResult(
        new ActivityResultContracts.RequestPermission(),
        granted -> {
            if (granted) sendToken(); else reply("push-error", "denied");
        }
    );

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfficeHubPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();

        // No signal when opening a page: show the app's own offline page with a Try again button.
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame() && HOST.equals(request.getUrl().getHost())) {
                    view.loadUrl(getBridge().getLocalUrl() + "/offline.html");
                }
            }
        });

        // Excel exports and other files go to the phone's Downloads folder (signed-in session included).
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);
                request.addRequestHeader("User-Agent", userAgent);
                request.setTitle(name);
                request.setMimeType(mimeType);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, getString(R.string.downloading, name), Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            }
        });

        // Fingerprint / face sign-in (passkeys) inside the app, on phones whose WebView supports it.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(webView.getSettings(), WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        }

        // window.OfficeHubNative: lets Office Hub pages (and only them) ask for phone alerts.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "OfficeHubNative", Collections.singleton(ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame) return;
                    pageReply = replyProxy;
                    onPageMessage(message.getData());
                });
        }

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Office Hub", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Reminders, approvals and updates from Office Hub");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }

        // Back: previous Office Hub page, or leave the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge().getWebView();
                WebBackForwardList history = w.copyBackForwardList();
                int i = history.getCurrentIndex();
                if (i > 0 && HOST.equals(Uri.parse(history.getItemAtIndex(i - 1).getUrl()).getHost())) w.goBack();
                else moveTaskToBack(true);
            }
        });

        String start = urlFrom(getIntent());
        webView.loadUrl(start != null ? start : HOME);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = urlFrom(intent);
        if (url != null) getBridge().getWebView().loadUrl(url);
    }

    /** An Office Hub link (app link) or a tapped phone alert ("url" = page path). */
    private static String urlFrom(Intent intent) {
        if (intent == null) return null;
        Uri data = intent.getData();
        if (data != null && "https".equals(data.getScheme()) && HOST.equals(data.getHost())) return data.toString();
        String path = intent.getStringExtra("url");
        if (path != null && path.startsWith("/") && !path.startsWith("//")) return ORIGIN + path;
        return null;
    }

    // ---------------------------------------------------------------- phone alerts

    private void onPageMessage(String data) {
        String type;
        try {
            type = new JSONObject(data == null ? "{}" : data).optString("type");
        } catch (Exception e) {
            return;
        }
        boolean granted = Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        switch (type) {
            case "push-status":
                reply("push-status", (firebaseReady() ? "ready" : "unavailable") + "," + (granted ? "granted" : "not-granted"));
                break;
            case "push-enable":
                if (!firebaseReady()) reply("push-error", "unavailable");
                else if (granted) sendToken();
                else askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS);
                break;
            case "push-token":
                if (firebaseReady() && granted) sendToken();
                else reply("push-token", "");
                break;
            case "push-disable":
                if (firebaseReady()) FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(t -> reply("push-disabled", "ok"));
                else reply("push-disabled", "ok");
                break;
            default:
                break;
        }
    }

    private boolean firebaseReady() {
        try {
            FirebaseMessaging.getInstance();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void sendToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) reply("push-token", task.getResult());
            else reply("push-error", "token");
        });
    }

    private void reply(String type, String value) {
        if (pageReply == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("type", type);
            o.put("value", value);
            final String msg = o.toString();
            runOnUiThread(() -> pageReply.postMessage(msg));
        } catch (Exception ignored) {
            // nothing to tell the page
        }
    }
}
