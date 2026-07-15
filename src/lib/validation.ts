import { z } from "zod";

/** Shared Zod schemas (spec §9 — every API input validated before touching DB). */

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const contactSchema = z.object({
  name: z.string().trim().min(1),
  designation: z.string().trim().optional(),
  mobile: phoneSchema,
});

export const referenceSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
});

export const leadSourceSchema = z.enum([
  "Reference",
  "SiteVisit",
  "CallIn",
  "Builder",
  "Consultant",
  "Other",
]);

/** Structured plant-sizing + inlet water-quality fields (spec §7.1). All optional. */
const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
const optNum = z.preprocess(emptyToUndef, z.coerce.number().nonnegative().optional());
const optStr = z.preprocess(emptyToUndef, z.string().trim().optional());
export const plantSizingFields = {
  plantType: optStr,
  technology: optStr,
  capacityKLD: optNum,
  segment: optStr,
  budgetBand: optStr,
  decisionTimeline: optStr,
  inletBOD: optNum,
  inletCOD: optNum,
  inletTSS: optNum,
  inletTDS: optNum,
};

export const createLeadSchema = z.object({
  customerName: z.string().trim().min(2, "Customer name required"),
  address: z.string().trim().min(2, "Address required"),
  projectName: z.string().trim().optional(),
  projectAddress: z.string().trim().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal("")),
  source: leadSourceSchema,
  requirement: z.string().trim().optional(),
  assignedToId: z.string().trim().optional(),
  referenceId: z.string().trim().optional(),
  reference: referenceSchema.optional(),
  contacts: z.array(contactSchema).optional(),
  overrideDuplicate: z.boolean().optional(),
  duplicateNote: z.string().trim().optional(),
  ...plantSizingFields,
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** Editable core lead fields (contacts/reference are managed on their own). */
export const updateLeadSchema = z.object({
  customerName: z.string().trim().min(2, "Customer name required"),
  address: z.string().trim().min(2, "Address required"),
  projectName: z.string().trim().optional(),
  projectAddress: z.string().trim().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal("")),
  source: leadSourceSchema,
  requirement: z.string().trim().optional(),
  overrideDuplicate: z.boolean().optional(),
  ...plantSizingFields,
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const manualStatusSchema = z.enum([
  "NEW",
  "IN_FOLLOWUP",
  "QUOTE_REQUESTED",
  "ON_HOLD",
  "LOST",
]);
export const setLeadStatusSchema = z
  .object({
    status: manualStatusSchema,
    lostReason: z.string().trim().optional(),
  })
  .refine((d) => d.status !== "LOST" || (d.lostReason && d.lostReason.length > 0), {
    message: "A reason is required to mark a lead LOST",
    path: ["lostReason"],
  });
export type SetLeadStatusInput = z.infer<typeof setLeadStatusSchema>;

export const followUpTypeSchema = z.enum([
  "CALL",
  "SITE_VISIT",
  "WHATSAPP",
  "EMAIL",
  "MEETING",
]);
export const followUpOutcomeSchema = z.enum([
  "INTERESTED",
  "NEEDS_TIME",
  "PRICE_DISCUSSION",
  "NOT_REACHABLE",
  "NEGATIVE",
]);

export const createFollowUpSchema = z
  .object({
    leadId: z.string().optional(),
    proposalId: z.string().optional(),
    type: followUpTypeSchema,
    notes: z.string().trim().min(1, "Notes required"),
    rawTranscript: z.string().optional(),
    audioUrl: z.string().url().optional(),
    outcome: followUpOutcomeSchema.optional(),
    nextDate: z.coerce.date().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    geoAddress: z.string().optional(),
    attachments: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
    // Status transition — when closing, nextDate not required but reason may be.
    closeStatus: z.enum(["LOST", "ON_HOLD"]).optional(),
    lostReason: z.string().trim().optional(),
  })
  .refine((d) => d.leadId || d.proposalId, {
    message: "leadId or proposalId is required",
  })
  .refine((d) => d.closeStatus || d.nextDate, {
    message: "Next follow-up date is required unless the lead is being closed",
    path: ["nextDate"],
  })
  .refine((d) => d.closeStatus !== "LOST" || (d.lostReason && d.lostReason.length > 0), {
    message: "A reason is required when marking a lead LOST",
    path: ["lostReason"],
  });
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const updateFollowUpSchema = z.object({
  notes: z.string().trim().min(1, "Notes required"),
  nextDate: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional()),
  outcome: z.preprocess((v) => (v === "" || v === null ? undefined : v), followUpOutcomeSchema.optional()),
});
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
