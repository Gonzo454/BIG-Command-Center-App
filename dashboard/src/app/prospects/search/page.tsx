import { LoadingState } from "@/components/LoadingState";
import { Suspense } from "react";
import { ProspectSearchContent } from "./SearchContent";

export default function ProspectSearchPage() {
  return (
    <Suspense
      fallback={
        <LoadingState />
      }
    >
      <ProspectSearchContent />
    </Suspense>
  );
}
