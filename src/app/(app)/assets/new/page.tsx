import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { scheduleFor } from "@/lib/assets";
import { getStore } from "@/lib/db";
import { currentYear, today } from "@/lib/dates";
import { midQuarterApplies, requireAssetClass } from "@/lib/depreciation";

import { createAsset } from "../actions";

export const metadata = { title: "Add asset · Schedule F Books" };

export default async function NewAssetPage() {
  await requireUser();

  // If this year's fourth-quarter additions already exceed 40% of the total,
  // mid-quarter is mandatory - default the form to it rather than let someone
  // pick half-year and quietly get it wrong.
  const placedThisYear = getStore().assetsPlacedInYear(currentYear());
  const midQuarterSuggested = midQuarterApplies(
    placedThisYear.map((a) => ({
      placedInService: a.placedInService,
      basis: scheduleFor(a).depreciableBasis,
      realProperty: requireAssetClass(a.assetClassId).realProperty,
    })),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Add an asset"
        subtitle="Machinery, buildings, breeding stock, land improvements."
      />
      <AssetForm
        action={createAsset}
        today={today()}
        submitLabel="Save asset"
        midQuarterSuggested={midQuarterSuggested}
      />
    </div>
  );
}
