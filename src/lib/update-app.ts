/** Load the newest Office Hub: refresh the offline helper (service worker), then reload. What's new shows after. */
export async function updateApp() {
  try {
    localStorage.setItem("oh_whats_new_pending", "1");
  } catch {
    /* private mode */
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.waiting?.postMessage("SKIP_WAITING");
  } catch {
    /* no service worker */
  }
  window.location.reload();
}
