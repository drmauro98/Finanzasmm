import HouseholdProvider from "@/components/HouseholdProvider";
import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <HouseholdProvider>
      <Nav />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</main>
      </div>
    </HouseholdProvider>
  );
}
