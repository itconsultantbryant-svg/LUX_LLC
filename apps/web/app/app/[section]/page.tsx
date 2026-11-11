"use client";
import { use } from "react";
import {
  PaymentsModule,
  EligibilityModule,
  ReconciliationModule,
  TeamModule,
  ContentModule,
  UsersModule,
  SettingsModule,
  ReportsModule,
  SupportModule,
  GenericModule,
  EncountersModule,
} from "../../../components/modules";
export default function ModulePage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = use(params);
  switch (section) {
    case "encounters":
      return <EncountersModule />;
    case "payments":
      return <PaymentsModule />;
    case "eligibility":
      return <EligibilityModule />;
    case "reconciliation":
      return <ReconciliationModule />;
    case "team":
      return <TeamModule />;
    case "content":
      return <ContentModule />;
    case "users":
      return <UsersModule />;
    case "settings":
      return <SettingsModule />;
    case "reports":
      return <ReportsModule />;
    case "fees":
      return <ReportsModule fees />;
    case "support":
      return <SupportModule />;
    default:
      return <GenericModule section={section} />;
  }
}
