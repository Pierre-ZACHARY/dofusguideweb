import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/$guideId")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
