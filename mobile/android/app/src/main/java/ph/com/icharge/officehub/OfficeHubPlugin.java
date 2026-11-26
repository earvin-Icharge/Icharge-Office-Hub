package ph.com.icharge.officehub;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Office Hub pages open inside the app; every other link (files, maps, email) opens outside it.
 * Office Hub is deliberately not in "allowNavigation": that would route its pages through
 * Capacitor's local relay, which loses sign-in cookies on redirects.
 */
@CapacitorPlugin(name = "OfficeHub")
public class OfficeHubPlugin extends Plugin {

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if ("https".equals(url.getScheme()) && MainActivity.HOST.equals(url.getHost())) return false;
        return null;
    }
}
