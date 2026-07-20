import { getWalletData } from "@/lib/actions";
import WalletDashboard from "@/components/WalletDashboard";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const walletData = await getWalletData();
  return <WalletDashboard data={walletData} />;
}
