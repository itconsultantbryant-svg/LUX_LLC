import {
  AiBand,
  ClaimChecks,
  ClaimJourney,
  DemoPreview,
  FamilySection,
  HomeHero,
  JoinBand,
  OrangeSection,
  PartnerSection,
  PatientJourney,
  Portals,
  PromiseBand,
  RoadmapSection,
  TeamSection,
  TrustSection,
} from "../../components/site";

export default function Home() {
  return (
    <>
      <HomeHero />
      <PatientJourney />
      <FamilySection />
      <ClaimChecks />
      <ClaimJourney />
      <Portals />
      <DemoPreview />
      <AiBand />
      <OrangeSection />
      <TrustSection />
      <PartnerSection />
      <RoadmapSection />
      <TeamSection preview />
      <PromiseBand />
      <JoinBand />
    </>
  );
}
