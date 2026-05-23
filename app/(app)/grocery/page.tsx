import { GroceryView } from "@/components/modules/grocery/GroceryView";
import { listGroceryItemsCore } from "@/lib/db/core/grocery";

export const dynamic = "force-dynamic";

export default async function GroceryPage() {
  const items = await listGroceryItemsCore({ include_checked: true });
  return <GroceryView initialItems={items} />;
}
