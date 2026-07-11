import { test, expect } from "@playwright/test";

/** Unique valid Indian mobile: 10 digits, starts 6-9. */
function uniquePhone(): string {
  return "9" + String(Date.now()).slice(-9);
}

/**
 * Field actions exercised directly against the REST endpoints that back the
 * offline queue: POST /api/leads then POST /api/followups for that lead.
 */
test("POST /api/leads then POST /api/followups succeed", async ({ request }) => {
  const phone = uniquePhone();

  // 1) Create a lead.
  const leadRes = await request.post("/api/leads", {
    data: {
      customerName: `E2E API Lead ${phone}`,
      address: "88 API Street, Chennai",
      phone,
      source: "Reference",
    },
  });
  expect(leadRes.status(), await leadRes.text()).toBe(200);
  const leadBody = await leadRes.json();
  // createLead returns { lead: {...} } on success (or { duplicate } on conflict).
  expect(leadBody.lead, JSON.stringify(leadBody)).toBeTruthy();
  const leadId: string = leadBody.lead.id;
  expect(leadId).toBeTruthy();

  // 2) Add a follow-up for that lead.
  const nextDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const fuRes = await request.post("/api/followups", {
    data: {
      leadId,
      type: "CALL",
      notes: "E2E API follow-up",
      nextDate,
    },
  });
  expect(fuRes.status(), await fuRes.text()).toBe(200);
  const fuBody = await fuRes.json();
  expect(fuBody.ok, JSON.stringify(fuBody)).toBe(true);
});
