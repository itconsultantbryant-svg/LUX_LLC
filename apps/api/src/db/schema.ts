import { sql } from 'drizzle-orm';
import {
  bigint,
  numeric,
  boolean,
  uniqueIndex,
  check,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', [
  'customer',
  'contributor',
  'provider_staff',
  'provider_manager',
  'organization_admin',
  'program_manager',
  'finance_operator',
  'partner_officer',
  'provider_admin',
  'employer_admin',
  'sponsor_admin',
  'reviewer',
  'platform_admin',
  'partner_readonly',
  'system',
]);

export const billStatusEnum = pgEnum('bill_status', [
  'draft',
  'extracting',
  'extracted',
  'user_review',
  'validated',
  'funding_proposed',
  'awaiting_auth',
  'paying',
  'paid',
  'failed',
  'needs_review',
]);

export const adapterModeEnum = pgEnum('adapter_mode', ['sandbox', 'live']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phoneE164: varchar('phone_e164', { length: 20 }).notNull().unique(),
  displayName: varchar('display_name', { length: 200 }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  /** Set when an account deletion request is processed. Identity is scrubbed but
   * financial and audit records are retained under the retention policy. */
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  verificationStatus: varchar('verification_status', { length: 20 })
    .notNull()
    .default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: appRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const consents = pgTable('consents', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  consentType: varchar('consent_type', { length: 100 }).notNull(),
  granted: boolean('granted').notNull(),
  version: varchar('version', { length: 40 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const wallets = pgTable('wallets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  currency: varchar('currency', { length: 3 }).notNull(),
  label: varchar('label', { length: 200 }).notNull().default('Healthcare wallet'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'restrict' }),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  entryType: varchar('entry_type', { length: 64 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
  referenceType: varchar('reference_type', { length: 64 }),
  referenceId: uuid('reference_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bills = pgTable('bills', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerUserId: uuid('customer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  dependentId: uuid('dependent_id').references(() => dependents.id),
  providerOrganizationId: uuid('provider_organization_id').references(() => organizations.id),
  category: varchar('category', { length: 80 }).notNull().default('general'),
  status: billStatusEnum('status').notNull().default('draft'),
  currency: varchar('currency', { length: 3 }),
  totalAmountMinor: integer('total_amount_minor'),
  providerName: varchar('provider_name', { length: 300 }),
  confirmedFields: jsonb('confirmed_fields').$type<Record<string, unknown>>(),
  validationState: text('validation_state'),
  extractionReviewedAt: timestamp('extraction_reviewed_at', { withTimezone: true }),
  extractionReviewedBy: uuid('extraction_reviewed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const billDocuments = pgTable('bill_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  storageKey: text('storage_key').notNull(),
  contentType: varchar('content_type', { length: 120 }).notNull(),
  byteSize: integer('byte_size').notNull(),
  /** Set when the retention job removes the stored bytes. Metadata is retained so
   * bill references stay intact; the document is no longer downloadable. */
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiArtifacts = pgTable('ai_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id, { onDelete: 'cascade' }),
  workflow: varchar('workflow', { length: 64 }).notNull(),
  mode: adapterModeEnum('mode').notNull(),
  adapterId: varchar('adapter_id', { length: 128 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  confidence: integer('confidence_bps'),
  humanReviewRequired: boolean('human_review_required').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const paymentIntents = pgTable('payment_intents', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id, { onDelete: 'restrict' }),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 40 }).notNull(),
  adapterMode: adapterModeEnum('adapter_mode').notNull(),
  adapterReference: varchar('adapter_reference', { length: 200 }),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
  simulationLabel: varchar('simulation_label', { length: 200 }),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  failureCode: text('failure_code'),
  lastEventSequence: integer('last_event_sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorUserId: uuid('actor_user_id'),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: uuid('entity_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const jobQueue = pgTable('job_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobType: varchar('job_type', { length: 64 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull(),
    authMethod: varchar('auth_method', { length: 20 }).notNull().default('sandbox'),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    ipHash: varchar('ip_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('otp_phone_created_idx').on(table.phone, table.createdAt),
    index('otp_ip_created_idx').on(table.ipHash, table.createdAt),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    authMethod: varchar('auth_method', { length: 20 }).notNull().default('sandbox'),
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_sessions_user_idx').on(table.userId)],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    kind: varchar('kind', { length: 30 }).notNull(),
    registrationNumber: varchar('registration_number', { length: 100 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('organization_kind_valid', sql`${table.kind} IN ('provider','sponsor','partner')`),
    check(
      'organization_status_valid',
      sql`${table.status} IN ('pending','approved','rejected','suspended')`,
    ),
  ],
);
export const memberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 40 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('membership_org_user_role_unique').on(
      table.organizationId,
      table.userId,
      table.role,
    ),
    check(
      'membership_role_valid',
      sql`${table.role} IN ('provider_staff','provider_manager','organization_admin','program_manager','reviewer','finance_operator','partner_officer')`,
    ),
    check('membership_status_valid', sql`${table.status} IN ('active','suspended','revoked')`),
  ],
);
export const invitations = pgTable('organization_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  phone: varchar('phone', { length: 20 }).notNull(),
  role: varchar('role', { length: 40 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const mfaCredentials = pgTable('mfa_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretEncrypted: text('secret_encrypted').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  lastStep: integer('last_step').notNull().default(-1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const recoveryCodes = pgTable('recovery_codes', {
  hash: varchar('hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const identityLimits = pgTable('identity_limits', {
  key: varchar('key', { length: 100 }).primaryKey(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const customerProfiles = pgTable('customer_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  preferredLanguage: varchar('preferred_language', { length: 20 }).notNull().default('en'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const dependents = pgTable('dependents', {
  id: uuid('id').defaultRandom().primaryKey(),
  guardianUserId: uuid('guardian_user_id')
    .notNull()
    .references(() => users.id),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  relationship: varchar('relationship', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const careAuthorizations = pgTable('care_authorizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  caregiverUserId: uuid('caregiver_user_id')
    .notNull()
    .references(() => users.id),
  dependentId: uuid('dependent_id').references(() => dependents.id),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const verificationReviews = pgTable('verification_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: varchar('entity_type', { length: 30 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  reviewerUserId: uuid('reviewer_user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 20 }).notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
export const contributions = pgTable('contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  contributorUserId: uuid('contributor_user_id')
    .notNull()
    .references(() => users.id),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  paymentReference: varchar('payment_reference', { length: 200 }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Exact financial values use bigint minor units; serialize as decimal strings at API boundaries.
const recordId = () => uuid('id').defaultRandom().primaryKey();
const created = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const minor = (column: string) => bigint(column, { mode: 'bigint' });
const currencyCode = () => varchar('currency', { length: 3 }).notNull();

export const providers = pgTable(
  'providers',
  {
    id: recordId(),
    organizationId: uuid('organization_id')
      .notNull()
      .unique()
      .references(() => organizations.id),
    legalName: text('legal_name').notNull(),
    licenseNumber: text('license_number').notNull(),
    status: text('status').notNull().default('pending'),
    address: jsonb('address').notNull().default({}),
    createdAt: created(),
  },
  (t) => [
    check(
      'provider_status_valid',
      sql`${t.status} IN ('pending','verified','rejected','suspended')`,
    ),
  ],
);
export const providerVerificationRecords = pgTable('provider_verification_records', {
  id: recordId(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  reviewerUserId: uuid('reviewer_user_id')
    .notNull()
    .references(() => users.id),
  status: text('status').notNull(),
  note: text('note').notNull(),
  evidenceDocumentId: uuid('evidence_document_id').references(() => billDocuments.id),
  method: text('method').notNull().default('legacy'),
  evidenceReference: text('evidence_reference'),
  verifiedDetails: jsonb('verified_details'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  createdAt: created(),
});
export const programs = pgTable(
  'programs',
  {
    id: recordId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    currency: currencyCode(),
    status: text('status').notNull().default('draft'),
    ruleVersion: integer('rule_version').notNull().default(1),
    allowedCategories: text('allowed_categories')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    allowedProviderIds: uuid('allowed_provider_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    maxPerPaymentMinor: minor('max_per_payment_minor'),
    budgetMinor: minor('budget_minor'),
    rules: jsonb('rules').notNull().default({}),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check('program_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('program_limit_positive', sql`${t.maxPerPaymentMinor} > 0`),
    check(
      'program_status_valid',
      sql`${t.status} IN ('draft','pending_approval','active','paused','closed')`,
    ),
    check('program_budget_positive', sql`${t.budgetMinor} IS NULL OR ${t.budgetMinor} > 0`),
  ],
);
export const fundingAllocations = pgTable(
  'funding_allocations',
  {
    id: recordId(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    source: text('source').notNull(),
    currency: currencyCode(),
    beneficiaryUserId: uuid('beneficiary_user_id')
      .notNull()
      .references(() => users.id),
    dependentId: uuid('dependent_id').references(() => dependents.id),
    programId: uuid('program_id').references(() => programs.id),
    contributionId: uuid('contribution_id').references(() => contributions.id),
    status: text('status').notNull().default('active'),
    allowedCategories: text('allowed_categories')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    allowedProviderIds: uuid('allowed_provider_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    maxPerPaymentMinor: minor('max_per_payment_minor'),
    rules: jsonb('rules').notNull().default({}),
    programRuleVersion: integer('program_rule_version'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check(
      'allocation_source_valid',
      sql`${t.source} IN ('personal_savings','family_contributions','employer_benefits','sponsor_vouchers','rewards','partner_credit')`,
    ),
    check('allocation_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('allocation_limit_positive', sql`${t.maxPerPaymentMinor} > 0`),
    check('allocation_status_valid', sql`${t.status} IN ('active','suspended','closed')`),
    index('allocation_wallet_idx').on(t.walletId),
  ],
);
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: recordId(),
    code: text('code').notNull().unique(),
    currency: currencyCode(),
    allocationId: uuid('allocation_id').references(() => fundingAllocations.id),
    bucket: text('bucket'),
    kind: text('kind').notNull(),
    normalSide: text('normal_side').notNull(),
    balanceMinor: minor('balance_minor')
      .notNull()
      .default(sql`0`),
    allowNegative: boolean('allow_negative').notNull().default(false),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('allocation_bucket_unique').on(t.allocationId, t.bucket),
    check('account_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('account_side_valid', sql`${t.normalSide} IN ('debit','credit')`),
    check(
      'account_kind_valid',
      sql`${t.kind} IN ('asset','liability','equity','income','expense')`,
    ),
    check('account_balance_nonnegative', sql`${t.allowNegative} OR ${t.balanceMinor} >= 0`),
    check(
      'account_allocation_bucket_valid',
      sql`(${t.allocationId} IS NULL AND ${t.bucket} IS NULL) OR (${t.allocationId} IS NOT NULL AND ${t.bucket} IN ('available','reserved','pending','restricted') AND ${t.normalSide}='credit' AND ${t.kind}='liability' AND NOT ${t.allowNegative})`,
    ),
  ],
);
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: recordId(),
    currency: currencyCode(),
    status: text('status').notNull().default('draft'),
    operation: text('operation').notNull(),
    description: text('description').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    reversalOf: uuid('reversal_of').unique(), // self-reference is added by the invariant migration.
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: created(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
  },
  (t) => [
    check('journal_status_valid', sql`${t.status} IN ('draft','posted')`),
    check('journal_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);
export const journalLines = pgTable(
  'journal_lines',
  {
    id: recordId(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journalEntries.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    side: text('side').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    createdAt: created(),
  },
  (t) => [
    check('journal_line_positive', sql`${t.amountMinor} > 0`),
    check('journal_line_side_valid', sql`${t.side} IN ('debit','credit')`),
    index('journal_line_account_idx').on(t.accountId),
    index('journal_line_journal_idx').on(t.journalId),
  ],
);
export const financialOperations = pgTable('financial_operations', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(),
  operation: text('operation').notNull(),
  result: jsonb('result').notNull(),
  createdAt: created(),
});
export const fundingReservations = pgTable(
  'funding_reservations',
  {
    id: recordId(),
    allocationId: uuid('allocation_id')
      .notNull()
      .references(() => fundingAllocations.id),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reserveJournalId: uuid('reserve_journal_id')
      .notNull()
      .references(() => journalEntries.id),
    terminalJournalId: uuid('terminal_journal_id').references(() => journalEntries.id),
    createdAt: created(),
  },
  (t) => [
    check('reservation_positive', sql`${t.amountMinor} > 0`),
    check('reservation_status_valid', sql`${t.status} IN ('active','captured','released')`),
    index('reservation_intent_idx').on(t.paymentIntentId),
  ],
);
export const billItems = pgTable(
  'bill_items',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    description: text('description').notNull(),
    category: text('category').notNull(),
    quantity: integer('quantity').notNull(),
    unitAmountMinor: minor('unit_amount_minor').notNull(),
    totalAmountMinor: minor('total_amount_minor').notNull(),
    currency: currencyCode(),
    createdAt: created(),
  },
  (t) => [
    check(
      'bill_item_amounts_valid',
      sql`${t.quantity}>0 AND ${t.unitAmountMinor}>=0 AND ${t.totalAmountMinor}=${t.quantity}::numeric * ${t.unitAmountMinor}`,
    ),
  ],
);
export const aiRuns = pgTable(
  'ai_runs',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    documentId: uuid('document_id').references(() => billDocuments.id),
    mode: adapterModeEnum('mode').notNull(),
    adapterId: text('adapter_id').notNull(),
    modelVersion: text('model_version').notNull(),
    status: text('status').notNull(),
    inputDigest: text('input_digest').notNull(),
    output: jsonb('output'),
    confidenceBps: integer('confidence_bps'),
    requiresReview: boolean('requires_review').notNull().default(true),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [check('ai_confidence_range', sql`${t.confidenceBps} BETWEEN 0 AND 10000`)],
);
export const validationFindings = pgTable('validation_findings', {
  id: recordId(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id),
  aiRunId: uuid('ai_run_id').references(() => aiRuns.id),
  code: text('code').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  field: text('field'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: created(),
});
export const reviewCases = pgTable('review_cases', {
  id: recordId(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  billId: uuid('bill_id').references(() => bills.id),
  providerId: uuid('provider_id').references(() => providers.id),
  assignedTo: uuid('assigned_to').references(() => users.id),
  status: text('status').notNull().default('open'),
  reason: text('reason').notNull(),
  decision: jsonb('decision'),
  createdAt: created(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: recordId(),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    attemptNumber: integer('attempt_number').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    adapterMode: adapterModeEnum('adapter_mode').notNull(),
    adapterReference: text('adapter_reference'),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('payment_attempt_number_unique').on(t.paymentIntentId, t.attemptNumber),
    check('payment_attempt_positive', sql`${t.amountMinor}>0 AND ${t.attemptNumber}>0`),
  ],
);
export const partnerSettlements = pgTable(
  'partner_settlements',
  {
    id: recordId(),
    paymentIntentId: uuid('payment_intent_id').references(() => paymentIntents.id),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journalEntries.id),
    partnerOrganizationId: uuid('partner_organization_id').references(() => organizations.id),
    direction: text('direction').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    status: text('status').notNull().default('expected'),
    adapterMode: adapterModeEnum('adapter_mode').notNull(),
    partnerReference: text('partner_reference'),
    evidence: jsonb('evidence'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('settlement_partner_reference_unique').on(
      t.partnerOrganizationId,
      t.partnerReference,
    ),
    check('settlement_positive', sql`${t.amountMinor}>0`),
    check('settlement_direction_valid', sql`${t.direction} IN ('inbound','outbound')`),
    check(
      'settlement_status_valid',
      sql`${t.status} IN ('expected','submitted','confirmed','failed','disputed')`,
    ),
    check(
      'settlement_confirmation_evidence',
      sql`${t.status}<>'confirmed' OR (${t.partnerReference} IS NOT NULL AND ${t.evidence} IS NOT NULL AND ${t.confirmedAt} IS NOT NULL)`,
    ),
  ],
);
export const receipts = pgTable(
  'receipts',
  {
    id: recordId(),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .unique()
      .references(() => paymentIntents.id),
    settlementId: uuid('settlement_id')
      .notNull()
      .references(() => partnerSettlements.id),
    number: text('number').notNull().unique(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    status: text('status').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('receipt_positive', sql`${t.amountMinor}>0`)],
);
export const vouchers = pgTable(
  'vouchers',
  {
    id: recordId(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    allocationId: uuid('allocation_id')
      .notNull()
      .unique()
      .references(() => fundingAllocations.id),
    codeHash: text('code_hash').notNull().unique(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    status: text('status').notNull().default('issued'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [check('voucher_positive', sql`${t.amountMinor}>0`)],
);
export const creditRecords = pgTable(
  'credit_records',
  {
    id: recordId(),
    allocationId: uuid('allocation_id')
      .notNull()
      .references(() => fundingAllocations.id),
    partnerOrganizationId: uuid('partner_organization_id')
      .notNull()
      .references(() => organizations.id),
    beneficiaryUserId: uuid('beneficiary_user_id')
      .notNull()
      .references(() => users.id),
    currency: currencyCode(),
    principalMinor: minor('principal_minor').notNull(),
    feeMinor: minor('fee_minor')
      .notNull()
      .default(sql`0`),
    repaidMinor: minor('repaid_minor')
      .notNull()
      .default(sql`0`),
    status: text('status').notNull(),
    termsVersion: text('terms_version').notNull(),
    terms: jsonb('terms').notNull().default({}),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    appeal: jsonb('appeal'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check(
      'credit_amounts_valid',
      sql`${t.principalMinor}>0 AND ${t.feeMinor}>=0 AND ${t.repaidMinor}>=0 AND ${t.repaidMinor}::numeric<=${t.principalMinor}::numeric+${t.feeMinor}`,
    ),
  ],
);
export const currencyConversions = pgTable(
  'currency_conversions',
  {
    id: recordId(),
    fromCurrency: varchar('from_currency', { length: 3 }).notNull(),
    toCurrency: varchar('to_currency', { length: 3 }).notNull(),
    fromAmountMinor: minor('from_amount_minor').notNull(),
    toAmountMinor: minor('to_amount_minor').notNull(),
    rate: numeric('rate', { precision: 38, scale: 18 }).notNull(),
    quoteReference: text('quote_reference').notNull(),
    fromJournalId: uuid('from_journal_id')
      .notNull()
      .unique()
      .references(() => journalEntries.id),
    toJournalId: uuid('to_journal_id')
      .notNull()
      .unique()
      .references(() => journalEntries.id),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: created(),
  },
  (t) => [
    check(
      'conversion_valid',
      sql`${t.fromCurrency}<>${t.toCurrency} AND ${t.fromAmountMinor}>0 AND ${t.toAmountMinor}>0 AND ${t.rate}>0`,
    ),
  ],
);
export const notifications = pgTable('notifications', {
  id: recordId(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  channel: text('channel').notNull(),
  template: text('template').notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('pending'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: created(),
});
export const disputes = pgTable(
  'disputes',
  {
    id: recordId(),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    paymentIntentId: uuid('payment_intent_id').references(() => paymentIntents.id),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    status: text('status').notNull().default('open'),
    reason: text('reason').notNull(),
    resolution: text('resolution'),
    adjustmentJournalId: uuid('adjustment_journal_id').references(() => journalEntries.id),
    createdAt: created(),
  },
  (t) => [check('dispute_positive', sql`${t.amountMinor}>0`)],
);

// Funding checkout is separate from provider bill-payment intents.
export const savingGoals = pgTable(
  'saving_goals',
  {
    id: recordId(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    label: text('label').notNull(),
    currency: currencyCode(),
    targetMinor: minor('target_minor').notNull(),
    createdAt: created(),
  },
  (t) => [check('goal_target_positive', sql`${t.targetMinor}>0`)],
);
export const supportLinks = pgTable('support_links', {
  id: recordId(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  beneficiaryLabel: text('beneficiary_label').notNull(),
  currencies: text('currencies').array().notNull(),
  categories: text('categories').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: created(),
});
export const fundingPayments = pgTable(
  'funding_payments',
  {
    id: recordId(),
    payerUserId: uuid('payer_user_id')
      .notNull()
      .references(() => users.id),
    beneficiaryUserId: uuid('beneficiary_user_id')
      .notNull()
      .references(() => users.id),
    goalId: uuid('goal_id').references(() => savingGoals.id),
    supportLinkId: uuid('support_link_id').references(() => supportLinks.id),
    kind: text('kind').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    feeMinor: minor('fee_minor').notNull(),
    currency: currencyCode(),
    categories: text('categories').array().notNull(),
    beneficiaryLabel: text('beneficiary_label').notNull(),
    status: text('status').notNull().default('quoted'),
    adapterId: text('adapter_id').notNull(),
    adapterMode: text('adapter_mode').notNull(),
    adapterReference: text('adapter_reference').unique(),
    international: boolean('international').notNull().default(false),
    quoteExpiresAt: timestamp('quote_expires_at', { withTimezone: true }).notNull(),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    journalId: uuid('journal_id')
      .unique()
      .references(() => journalEntries.id),
    allocationId: uuid('allocation_id')
      .unique()
      .references(() => fundingAllocations.id),
    createdAt: created(),
  },
  (t) => [
    check('funding_money_valid', sql`${t.amountMinor}>0 AND ${t.feeMinor}>=0`),
    check('funding_status_valid', sql`${t.status} IN ('quoted','pending','confirmed','failed')`),
    check(
      'funding_kind_valid',
      sql`(${t.kind}='deposit' AND ${t.supportLinkId} IS NULL AND ${t.payerUserId}=${t.beneficiaryUserId}) OR (${t.kind}='contribution' AND ${t.supportLinkId} IS NOT NULL AND ${t.goalId} IS NULL)`,
    ),
    check(
      'funding_confirmation_valid',
      sql`(${t.status}='confirmed') = (${t.journalId} IS NOT NULL AND ${t.allocationId} IS NOT NULL AND ${t.confirmedAt} IS NOT NULL)`,
    ),
    check('funding_mode_valid', sql`${t.adapterMode} IN ('sandbox','live')`),
    index('funding_payer_idx').on(t.payerUserId),
    index('funding_beneficiary_idx').on(t.beneficiaryUserId),
  ],
);
export const fundingEvents = pgTable(
  'funding_events',
  {
    id: recordId(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => fundingPayments.id),
    payloadHash: text('payload_hash').notNull(),
    outcome: text('outcome').notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex('funding_event_unique').on(t.provider, t.eventId)],
);
export const savingGuidance = pgTable(
  'saving_guidance',
  {
    id: recordId(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => savingGoals.id),
    consentId: uuid('consent_id')
      .notNull()
      .references(() => consents.id),
    currency: currencyCode(),
    weeklyMinor: minor('weekly_minor').notNull(),
    basis: jsonb('basis').notNull(),
    status: text('status').notNull().default('suggested'),
    createdAt: created(),
  },
  (t) => [
    check('guidance_amount_positive', sql`${t.weeklyMinor}>0`),
    check('guidance_status_valid', sql`${t.status} IN ('suggested','changed','dismissed')`),
  ],
);

export const providerAssociations = pgTable('provider_associations', {
  id: recordId(),
  tokenHash: text('token_hash').notNull().unique(),
  customerUserId: uuid('customer_user_id')
    .notNull()
    .references(() => users.id),
  dependentId: uuid('dependent_id').references(() => dependents.id),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: created(),
});
export const billRevisions = pgTable(
  'bill_revisions',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    revision: integer('revision').notNull(),
    reference: text('reference').notNull(),
    issueDate: text('issue_date').notNull(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id),
    providerName: text('provider_name').notNull(),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    currency: currencyCode(),
    items: jsonb('items').notNull(),
    totalMinor: minor('total_minor').notNull(),
    requiresDocuments: boolean('requires_documents').notNull().default(true),
    confirmationKind: text('confirmation_kind').notNull().default('invoice'),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('bill_revision_unique').on(t.billId, t.revision),
    check('bill_revision_positive', sql`${t.revision}>0 AND ${t.totalMinor}>0`),
    check('confirmation_kind_valid', sql`${t.confirmationKind} IN ('invoice','service')`),
  ],
);
export const billConfirmations = pgTable(
  'bill_confirmations',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    revision: integer('revision').notNull(),
    kind: text('kind').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    evidenceDocumentId: uuid('evidence_document_id').references(() => billDocuments.id),
    note: text('note').notNull(),
    createdAt: created(),
  },
  (t) => [
    check('bill_confirmation_kind', sql`${t.kind} IN ('customer','invoice','service')`),
    uniqueIndex('bill_confirmation_unique').on(t.billId, t.revision, t.kind),
  ],
);
export const billChangeHistory = pgTable('bill_change_history', {
  id: recordId(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id),
  before: jsonb('before').notNull(),
  after: jsonb('after').notNull(),
  createdAt: created(),
});
export const extractionCorrections = pgTable('extraction_corrections', {
  id: recordId(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id),
  aiRunId: uuid('ai_run_id').references(() => aiRuns.id),
  field: text('field').notNull(),
  originalValue: jsonb('original_value'),
  correctedValue: jsonb('corrected_value'),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  reason: text('reason'),
  createdAt: created(),
});
export const billCorrections = pgTable('bill_corrections', {
  id: recordId(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id),
  revision: integer('revision').notNull(),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  reason: text('reason').notNull(),
  proposedItems: jsonb('proposed_items').notNull(),
  status: text('status').notNull().default('submitted'),
  createdAt: created(),
});

export const validationPolicies = pgTable('validation_policies', {
  version: text('version').primaryKey(),
  status: text('status').notNull().default('draft'),
  approvedBy: text('approved_by').notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
  rules: jsonb('rules').notNull(),
  createdAt: created(),
});

export const validationRuns = pgTable(
  'validation_runs',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    policyVersion: text('policy_version').notNull(),
    modelVersion: text('model_version').notNull(),
    route: text('route').notNull(),
    customerStatus: text('customer_status').notNull(),
    overall: text('overall').notNull(),
    totalMinor: minor('total_minor'),
    currency: currencyCode(),
    summary: jsonb('summary').notNull().default({}),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    createdAt: created(),
  },
  (t) => [
    check(
      'validation_route_valid',
      sql`${t.route} IN ('auto_accept','needs_correction','await_provider','await_review','decline')`,
    ),
    check('validation_overall_valid', sql`${t.overall} IN ('pass','warn','fail','uncertain')`),
    index('validation_run_bill_idx').on(t.billId, t.createdAt),
  ],
);

/** One structured finding per check per run. Append-only; reviewers never mutate it. */
export const validationResults = pgTable(
  'validation_results',
  {
    id: recordId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => validationRuns.id),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    checkName: text('check_name').notNull(),
    label: text('label').notNull(),
    result: text('result').notNull(),
    severity: text('severity').notNull(),
    source: text('source').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    missingInfo: jsonb('missing_info').notNull().default([]),
    recommendedAction: text('recommended_action').notNull(),
    modelVersion: text('model_version'),
    policyVersion: text('policy_version').notNull(),
    field: text('field'),
    createdAt: created(),
  },
  (t) => [
    check('validation_source_valid', sql`${t.source} IN ('deterministic','ai','external')`),
    check(
      'validation_result_valid',
      sql`${t.result} IN ('pass','info','warn','fail','uncertain','unavailable','not_applicable')`,
    ),
    index('validation_result_run_idx').on(t.runId),
    index('validation_result_bill_idx').on(t.billId),
  ],
);

/** Every reviewer capability leaves one immutable, reasoned record here. */
export const validationReviewerActions = pgTable('validation_reviewer_actions', {
  id: recordId(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id),
  runId: uuid('run_id').references(() => validationRuns.id),
  reviewCaseId: uuid('review_case_id').references(() => reviewCases.id),
  action: text('action').notNull(),
  checkName: text('check_name'),
  reason: text('reason').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  authorityMinor: minor('authority_minor'),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: created(),
});

export const billAppeals = pgTable(
  'bill_appeals',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    runId: uuid('run_id').references(() => validationRuns.id),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    decision: jsonb('decision'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check('appeal_status_valid', sql`${t.status} IN ('open','upheld','overturned','withdrawn')`),
  ],
);

// Funding assistance: deterministic plans and the actions customers take on them.
export const billFundingPlans = pgTable(
  'bill_funding_plans',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    currency: currencyCode(),
    billAmountMinor: minor('bill_amount_minor').notNull(),
    eligibleSavingsMinor: minor('eligible_savings_minor')
      .notNull()
      .default(sql`0`),
    eligibleContributionsMinor: minor('eligible_contributions_minor')
      .notNull()
      .default(sql`0`),
    eligibleVouchersMinor: minor('eligible_vouchers_minor')
      .notNull()
      .default(sql`0`),
    otherEligibleMinor: minor('other_eligible_minor')
      .notNull()
      .default(sql`0`),
    eligibleInsuranceMinor: minor('eligible_insurance_minor')
      .notNull()
      .default(sql`0`),
    totalEligibleMinor: minor('total_eligible_minor').notNull(),
    allocatedMinor: minor('allocated_minor')
      .notNull()
      .default(sql`0`),
    shortfallMinor: minor('shortfall_minor').notNull(),
    insurance: jsonb('insurance').notNull(),
    sources: jsonb('sources').notNull(),
    actions: jsonb('actions').notNull(),
    policyVersion: text('policy_version').notNull(),
    planVersion: text('plan_version').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: created(),
  },
  (t) => [
    check(
      'plan_amounts_nonnegative',
      sql`${t.billAmountMinor}>=0 AND ${t.eligibleSavingsMinor}>=0 AND ${t.eligibleContributionsMinor}>=0 AND ${t.eligibleVouchersMinor}>=0 AND ${t.otherEligibleMinor}>=0 AND ${t.eligibleInsuranceMinor}>=0 AND ${t.totalEligibleMinor}>=0 AND ${t.allocatedMinor}>=0 AND ${t.shortfallMinor}>=0`,
    ),
    index('bill_funding_plan_bill_idx').on(t.billId),
  ],
);

export const supportRequests = pgTable(
  'support_requests',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    amountMinor: minor('amount_minor'),
    currency: currencyCode(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    resolution: text('resolution'),
    reviewerUserId: uuid('reviewer_user_id').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check('support_request_kind_valid', sql`${t.kind} IN ('shortfall_support','help')`),
    check(
      'support_request_status_valid',
      sql`${t.status} IN ('open','acknowledged','resolved','withdrawn')`,
    ),
    index('support_request_bill_idx').on(t.billId),
  ],
);

export const financingInquiries = pgTable(
  'financing_inquiries',
  {
    id: recordId(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id),
    creditRecordId: uuid('credit_record_id')
      .notNull()
      .references(() => creditRecords.id),
    partnerOrganizationId: uuid('partner_organization_id')
      .notNull()
      .references(() => organizations.id),
    currency: currencyCode(),
    amountMinor: minor('amount_minor').notNull(),
    status: text('status').notNull().default('requested'),
    createdAt: created(),
  },
  (t) => [
    check(
      'financing_inquiry_status_valid',
      sql`${t.status} IN ('requested','offered','accepted','declined','withdrawn')`,
    ),
    check('financing_inquiry_amount_positive', sql`${t.amountMinor}>0`),
  ],
);

// Provider payment lifecycle: verified callbacks (replay + ordering) and refunds.
export const billPaymentEvents = pgTable(
  'bill_payment_events',
  {
    id: recordId(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .references(() => paymentIntents.id),
    status: text('status').notNull(),
    sequence: integer('sequence').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    payloadHash: text('payload_hash').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    outcome: text('outcome').notNull().default('received'),
    raw: jsonb('raw').notNull(),
  },
  (t) => [
    uniqueIndex('bill_payment_event_unique').on(t.provider, t.eventId),
    index('bill_payment_event_intent_idx').on(t.paymentIntentId),
  ],
);
export const refunds = pgTable(
  'refunds',
  {
    id: recordId(),
    paymentIntentId: uuid('payment_intent_id')
      .notNull()
      .unique()
      .references(() => paymentIntents.id),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    status: text('status').notNull().default('requested'),
    reason: text('reason').notNull(),
    adapterReference: text('adapter_reference'),
    journalId: uuid('journal_id').references(() => journalEntries.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: created(),
  },
  (t) => [
    check('refund_positive', sql`${t.amountMinor}>0`),
    check('refund_status_valid', sql`${t.status} IN ('requested','succeeded','failed')`),
  ],
);

// P3-08: assistant actions that require explicit user confirmation.
export const assistantConfirmations = pgTable(
  'assistant_confirmations',
  {
    id: recordId(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    tool: text('tool').notNull(),
    action: text('action').notNull(),
    billId: uuid('bill_id').references(() => bills.id),
    payload: jsonb('payload').notNull(),
    summary: text('summary').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: created(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    result: jsonb('result'),
  },
  (t) => [
    check(
      'assistant_confirmation_status_valid',
      sql`${t.status} IN ('pending','confirmed','cancelled','expired')`,
    ),
  ],
);

// Conversation history for the LUX assistant chatbot. `content` holds the
// rendered text plus any structured payload (extraction results, suggested
// actions) so the transcript can be replayed to the client without re-deriving it.
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: recordId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [
    check('chat_message_role_valid', sql`${t.role} IN ('user','assistant')`),
    index('chat_message_user_idx').on(t.userId, t.createdAt),
  ],
);

// P3-09: program change proposals that require a distinct approver.
export const programApprovals = pgTable(
  'program_approvals',
  {
    id: recordId(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    requestedBy: uuid('requested_by').references(() => users.id),
    requiredRole: text('required_role').notNull(),
    changeType: text('change_type').notNull(),
    changePayload: jsonb('change_payload').notNull(),
    status: text('status').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decisionNote: text('decision_note'),
    createdAt: created(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    check('program_approval_status_valid', sql`${t.status} IN ('pending','approved','rejected')`),
    index('program_approval_program_idx').on(t.programId),
  ],
);

// P3-10: insurance coverage verification and claim preparation.
export const insurancePolicies = pgTable(
  'insurance_policies',
  {
    id: recordId(),
    insurerOrganizationId: uuid('insurer_organization_id')
      .notNull()
      .references(() => organizations.id),
    beneficiaryUserId: uuid('beneficiary_user_id')
      .notNull()
      .references(() => users.id),
    policyNumber: text('policy_number').notNull(),
    status: text('status').notNull().default('active'),
    coverage: jsonb('coverage').notNull().default({}),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    verifiedMethod: text('verified_method').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('insurance_policy_number_unique').on(t.insurerOrganizationId, t.policyNumber),
    check('insurance_policy_status_valid', sql`${t.status} IN ('active','lapsed','cancelled')`),
  ],
);
export const insuranceClaims = pgTable(
  'insurance_claims',
  {
    id: recordId(),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => insurancePolicies.id),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id),
    preparedBy: uuid('prepared_by')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('preparing'),
    amountClaimedMinor: minor('amount_claimed_minor').notNull(),
    amountApprovedMinor: minor('amount_approved_minor'),
    currency: currencyCode(),
    insurerReference: text('insurer_reference'),
    decision: jsonb('decision'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decisionAt: timestamp('decision_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check('insurance_claim_amount_positive', sql`${t.amountClaimedMinor}>0`),
    check(
      'insurance_claim_status_valid',
      sql`${t.status} IN ('preparing','submitted','insurer_review','approved','partially_approved','denied','appealed','paid')`,
    ),
  ],
);

// P3-10: rewards rules accrue into funded allocations with an auditable ledger.
export const rewardRules = pgTable(
  'reward_rules',
  {
    id: recordId(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    kind: text('kind').notNull(),
    bps: integer('bps'),
    flatMinor: minor('flat_minor'),
    terms: jsonb('terms').notNull().default({}),
    status: text('status').notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    check(
      'reward_rule_kind_valid',
      sql`${t.kind} IN ('per_transaction_bps','flat_per_transaction','campaign')`,
    ),
  ],
);
export const rewardEntries = pgTable(
  'reward_entries',
  {
    id: recordId(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => rewardRules.id),
    beneficiaryUserId: uuid('beneficiary_user_id')
      .notNull()
      .references(() => users.id),
    allocationId: uuid('allocation_id').references(() => fundingAllocations.id),
    type: text('type').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: currencyCode(),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    journalId: uuid('journal_id'),
    createdAt: created(),
  },
  (t) => [
    check(
      'reward_entry_type_valid',
      sql`${t.type} IN ('accrual','redemption','reversal','expiry')`,
    ),
    check('reward_entry_positive', sql`${t.amountMinor}>0`),
  ],
);

// P3-10: USSD/feature-phone session state (availability depends on adapter).
export const ussdSessions = pgTable('ussd_sessions', {
  id: recordId(),
  sessionCode: text('session_code').notNull().unique(),
  phone: text('phone').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  state: jsonb('state').notNull().default({}),
  lastScreen: text('last_screen'),
  createdAt: created(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Security hardening: runtime feature/kill switches. Absence of a row means the
// feature is enabled by default (fail-open on read, but every change is audited).
export const systemFlags = pgTable('system_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  reason: text('reason'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Security hardening: data-subject account deletion requests, processed under the
// retention policy (financial and audit records are retained).
export const accountDeletionRequests = pgTable(
  'account_deletion_requests',
  {
    id: recordId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('pending'),
    reason: text('reason'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processedBy: uuid('processed_by').references(() => users.id),
  },
  (t) => [
    check(
      'account_deletion_status_valid',
      sql`${t.status} IN ('pending','processing','completed','cancelled')`,
    ),
  ],
);
