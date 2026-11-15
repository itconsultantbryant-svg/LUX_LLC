import { Header, Footer } from "../../components/public-shell";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="lux-site">
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
