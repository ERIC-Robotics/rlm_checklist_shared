import { Suspense } from "react";
import SelectClient from "./SelectClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Select Version · Trial SOP Checklist",
};

export default function SelectPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SelectClient />
    </Suspense>
  );
}
