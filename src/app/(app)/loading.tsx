import { Loading } from "@/components/loading";

// Shown while an app page loads (Overworld, My Visits, place detail).
export default function AppLoading() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Loading />
    </div>
  );
}
