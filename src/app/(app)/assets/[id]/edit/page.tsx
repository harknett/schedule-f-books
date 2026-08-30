import { notFound } from "next/navigation";

import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { today } from "@/lib/dates";

import { updateAsset } from "../../actions";

export const metadata = { title: "Edit asset · Schedule F Books" };

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId)) notFound();

  const asset = getStore().getAsset(assetId);
  if (!asset) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Edit ${asset.name}`}
        subtitle="The schedule is recomputed from these inputs, so corrections flow through."
      />
      <AssetForm
        action={updateAsset.bind(null, assetId)}
        today={today()}
        existing={asset}
        submitLabel="Save changes"
      />
    </div>
  );
}
