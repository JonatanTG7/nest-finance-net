import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/travel")({
  head: () => ({
    meta: [
      { title: "מרכז הטיולים | כסף משפחתי" },
      { name: "description", content: "מעקב תקציב והוצאות לפי טיולים, בלי לשכפל תנועות." },
      { property: "og:title", content: "מרכז הטיולים | כסף משפחתי" },
      { property: "og:description", content: "מעקב תקציב והוצאות לפי טיולים." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Outlet />,
});
