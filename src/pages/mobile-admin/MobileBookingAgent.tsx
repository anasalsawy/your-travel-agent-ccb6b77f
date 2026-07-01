import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { AdminBookingAgent } from "@/components/admin/AdminBookingAgent";

export default function MobileBookingAgent() {
  return (
    <MobileAdminLayout title="Booking Agent">
      <div className="p-3">
        <AdminBookingAgent />
      </div>
    </MobileAdminLayout>
  );
}
