# AI development and product disclosure

## Competition statement

HealthWallet is being developed with AI-assisted planning, implementation,
testing, documentation, and review. The team must retain the source prompts,
implementation decisions, test output, and Git history used to support any
competition claim about the proportion of work completed with AI assistance.

Do not state that a specific percentage of the product was created with AI
unless the competition's measurement method and the project's evidence support
that statement.

## LUX assistant capabilities

The customer-facing LUX assistant is implemented at `/assistant` and is also
available from the in-app assistant widget. It can:

- explain the customer's own wallet, bill, and support information;
- read supported bill documents and display extracted fields and confidence;
- surface verified providers, optionally ranked from a location the customer
  shares for that request;
- prepare support and funding actions; and
- require explicit, expiring customer confirmation before every consequential
  action.

## Safety and transparency controls

- The assistant runs under the same authenticated authorization boundary as
  the rest of the application.
- Assistant activity and approved actions are audit logged.
- Uploaded-document extraction is currently a clearly labelled deterministic
  sandbox reader (`lux-healthtrust.ai.sandbox`), not a live generative model.
- The assistant does not make medical diagnoses, confirm eligibility, approve
  claims, or move money autonomously.
- Replies include an informational disclaimer and the assistant interface
  explains what data is used and when confirmation is required.

## Evidence to retain

For a competition submission, retain a private evidence bundle containing:

1. The AI prompts and outputs used for requirements, design, code, tests, and
   documentation.
2. Git commit hashes and pull-request/review history tied to each feature.
3. Automated test output, deployment verification, and screenshots or a short
   feature walkthrough.
4. A human-review log covering security, accessibility, accuracy, and product
   decisions.

Never include API keys, user health data, passwords, session cookies, or
production database exports in that bundle.
