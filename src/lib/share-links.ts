/**
 * Pure "redirect to the sender's own WhatsApp/mail client" link builders. No
 * server-only imports (env/prisma) — safe to import from a "use client" component,
 * unlike lib/whatsapp.ts / lib/email.ts which pull in runtime-config → prisma.
 */

/** wa.me deep link — opens WhatsApp (app or web) with the chat + message pre-filled. */
export function waShareLink(phone: string, text: string): string {
  return `https://wa.me/91${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** mailto: link — opens the user's own mail client with To/Subject/Body pre-filled. */
export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
