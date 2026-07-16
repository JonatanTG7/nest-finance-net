import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/investments")({
  head: () => ({ meta: [{ title: "השקעות" }] }),
  component: () => <Outlet />,
});
