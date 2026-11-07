import { Suspense } from "react";
import { FrontDoor } from "@/components/console/FrontDoor";

export default function Home() {
  // FrontDoor reads ?callbackUrl, which needs a Suspense boundary to prerender
  return (
    <Suspense>
      <FrontDoor mode="home" />
    </Suspense>
  );
}
