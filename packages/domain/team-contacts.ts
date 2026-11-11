import { z } from "zod";
export const teamContactsSchema = z
  .array(
    z
      .object({
        kind: z.enum([
          "email",
          "phone",
          "linkedin",
          "facebook",
          "instagram",
          "website",
          "x",
        ]),
        value: z.string().max(300),
        label: z.string().max(100).optional(),
      })
      .superRefine((c, ctx) => {
        let valid = false;
        if (c.kind === "email") valid = z.email().safeParse(c.value).success;
        else if (c.kind === "phone")
          valid = /^\+?[\d ()-]{7,25}$/.test(c.value);
        else {
          try {
            valid = new URL(c.value).protocol === "https:";
          } catch {}
        }
        if (!valid)
          ctx.addIssue({
            code: "custom",
            message: "Use a valid email, telephone number or HTTPS profile URL",
            path: ["value"],
          });
      }),
  )
  .max(8);
