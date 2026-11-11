import SiteHeader from "@/components/SiteHeader";

export default function TracksLayout({ children }: LayoutProps<"/tracks">) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">{children}</main>
    </div>
  );
}
