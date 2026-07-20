import { getLeadsFromSupabase } from "@/lib/supabase/leads-actions";
import LeadsCRM from "@/components/LeadsCRM";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  // RLS in Supabase automatically scopes this to the user's business_id.
  // Super Admins see all leads; all other roles only see their tenant's data.
  const leads = await getLeadsFromSupabase();

  return (
    <div className="h-full flex flex-col transition-colors duration-200">
      <LeadsCRM initialLeads={leads} />
    </div>
  );
}
