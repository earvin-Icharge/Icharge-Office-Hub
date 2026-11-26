import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getDevice, readDeviceKey } from "@/lib/device";
import { getViewer } from "@/lib/viewer";
import { UnlockForm } from "./UnlockForm";

export const metadata = { title: "Unlock" };

/** The app was closed for over 12 hours: fingerprint or PIN instead of an email code (spec 3.5). */
export default async function UnlockPage() {
  const viewer = await getViewer();
  if (!viewer?.active) redirect("/pending");
  const device = await getDevice(readDeviceKey(await cookies()), viewer.id);
  if (!device?.quick_method || device.removed_at) redirect("/today");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3"><Logo size={32} wordmarkClass="text-xl" /></div>
      <div className="flex w-full max-w-[400px] flex-col items-center gap-4 rounded-[20px] border border-line bg-white p-7 text-center">
        <UnlockForm name={viewer.name.split(" ")[0]} email={viewer.email} hasPasskey={!!device.passkey_credential_id} hasPin={!!device.pin_hash} phoneKey={device.passkey_credential_id === "native:android"} />
      </div>
    </div>
  );
}
