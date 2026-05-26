import { Suspense } from "react";
import ProtectedForm from "./ProtectedForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trial Checklist (RailwayMitra - POC2)",
};

export default function FormPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProtectedForm />
    </Suspense>
  );
}
