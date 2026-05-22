import { PlacesView } from "@/components/modules/places/PlacesView";
import { listPlaceCitiesCore, listPlacesCore } from "@/lib/db/core/places";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const [places, cities] = await Promise.all([
    listPlacesCore(),
    listPlaceCitiesCore(),
  ]);
  return <PlacesView initialPlaces={places} initialCities={cities} />;
}
