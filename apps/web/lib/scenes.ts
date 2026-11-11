const training = {
  position: "60% 45%",
  alt: "Midwives attending wellbaby training in Harper City, Liberia",
  caption: "Midwife training · Harper City, Liberia · 2017",
  category: "Healthcare in Liberia",
  author: "Robert1847",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  source:
    "https://commons.wikimedia.org/wiki/File:Midwives_at_a_training_conducted_by_Partners_in_Health_01.jpg",
};
const community = {
  position: "65% 50%",
  alt: "Liberian residents walking to a community outreach health fair in 2012",
  caption: "Community health outreach · Liberia · 2012",
  category: "Community health",
  author: "Capt. Amy Rittberger",
  license: "Public domain",
  licenseUrl:
    "https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/United_States#Works_by_the_US_Government",
  source:
    "https://commons.wikimedia.org/wiki/File:HSV_Swift_brings_training,_medical_care_to_Liberia_120807-F-YW322-286.jpg",
};
const monrovia = {
  position: "50% 10%",
  alt: "A jeans vendor with merchandise in Monrovia, Liberia",
  caption: "Everyday enterprise · Monrovia, Liberia",
  category: "Our local context",
  author: "FischerFotos",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  source: "https://commons.wikimedia.org/wiki/File:Monrovia_Jeans_Vendor.jpg",
};
export const scenes = {
  "patient-care": community,
  "facility-claims": training,
  "insurer-review": training,
  "orange-money-coordination": monrovia,
  "coverage-check": community,
  "partner-collaboration": training,
} as const;
export type SceneKey = keyof typeof scenes;
