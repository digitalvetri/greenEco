/**
 * One-time backfill for the new Client model (see markWon in proposal.ts).
 * Every existing Order row already represents a won proposal (Orders are only
 * ever created by markWon) but predates the Client FK, so `clientId` is null.
 *
 * Groups orders by their lead's exact customerName — the SAME identity key
 * `listClientCustomers`/`clientAnalytics` already group by, kept consistent on
 * purpose — creates one Client per group, links every order in the group to it,
 * and links the lead's ContactPerson rows too. Idempotent: only touches orders
 * with a null clientId, so re-running after new Wins is a safe no-op for
 * already-linked orders.
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const orders = await prisma.order.findMany({
    where: { clientId: null },
    select: {
      id: true,
      companyId: true,
      proposal: {
        select: {
          lead: {
            select: { customerName: true, phone: true, email: true, address: true, state: true, contacts: { select: { id: true } } },
          },
        },
      },
    },
  });

  console.log(`Found ${orders.length} order(s) with no clientId.`);
  if (orders.length === 0) return;

  const byCompanyAndName = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = `${o.companyId}::${o.proposal.lead.customerName}`;
    const g = byCompanyAndName.get(key) ?? [];
    g.push(o);
    byCompanyAndName.set(key, g);
  }

  let clientsCreated = 0;
  let clientsReused = 0;
  let ordersLinked = 0;
  let contactsLinked = 0;

  for (const [, group] of byCompanyAndName) {
    const first = group[0];
    const { companyId } = first;
    const { customerName, phone, email, address, state } = first.proposal.lead;

    let client = await prisma.client.findFirst({ where: { companyId, name: customerName } });
    if (client) {
      clientsReused++;
    } else {
      client = await prisma.client.create({
        data: { companyId, name: customerName, phone, email, address, state },
      });
      clientsCreated++;
    }

    for (const o of group) {
      await prisma.order.update({ where: { id: o.id }, data: { clientId: client.id } });
      ordersLinked++;
    }

    const contactIds = [...new Set(group.flatMap((o) => o.proposal.lead.contacts.map((c) => c.id)))];
    if (contactIds.length) {
      const res = await prisma.contactPerson.updateMany({
        where: { id: { in: contactIds }, clientId: null },
        data: { clientId: client.id },
      });
      contactsLinked += res.count;
    }
  }

  console.log(`Clients created: ${clientsCreated}, reused: ${clientsReused}`);
  console.log(`Orders linked: ${ordersLinked}`);
  console.log(`Contacts linked: ${contactsLinked}`);

  const stillNull = await prisma.order.count({ where: { clientId: null } });
  console.log(`Orders still missing clientId after backfill: ${stillNull}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
