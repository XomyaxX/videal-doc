import { requirePermission } from "@/lib/auth";
import { ProdNav } from "@/components/ProdNav";
import { canSeeScores } from "@/lib/prod-server";
import { canLeadProd } from "@/lib/prod";
import { canViewLibrary } from "@/lib/library";

export default async function ProdLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("prod.view");
  return (
    <div>
      <ProdNav showScores={canSeeScores(user)} canCreate={canLeadProd(user)} showLibrary={canViewLibrary(user)} />
      {children}
    </div>
  );
}
