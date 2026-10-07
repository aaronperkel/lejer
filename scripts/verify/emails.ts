// Every email template renders (HTML and plain text) with its PreviewProps, in the theme those
// props name, with the strings a recipient needs. Catches a template that throws or drops a
// field before any mail goes out.

import { createElement } from "react";
import type { Results } from "./harness";

export async function emails(r: Results) {
  r.section("emails: templates render");
  const { render } = await import("@react-email/components");
  const templates = {
    LoginCode: { mod: await import("@/emails/LoginCode"), expect: ["482913", "expires in 10 minutes"] },
    Invite: { mod: await import("@/emails/Invite"), expect: ["Join 7 Oak Lane", "login?email=alex%40example.com", "repeating-linear-gradient"] },
    NewBill: { mod: await import("@/emails/NewBill"), expect: ["New bill posted", "21.09", "Pay to", "Sam"] },
    Reminder: { mod: await import("@/emails/Reminder"), expect: ["Due soon", "25.17", "Pay to", "October 9, 2026"] },
    Thanks: { mod: await import("@/emails/Thanks"), expect: ["Payment recorded", "Thanks, Sam", "45.17", "Electric · due October 9, 2026"] },
    CustomNote: { mod: await import("@/emails/CustomNote"), expect: ["A note from Alex", "Internet is switching providers", "the 20th.", "router stays"] },
    BatchConfirmation: { mod: await import("@/emails/BatchConfirmation"), expect: ["2 reminders sent", "October 7, 2026", "due soon", "repeating-linear-gradient"] },
    BulkReceipt: { mod: await import("@/emails/BulkReceipt"), expect: ["Bulk email receipt", "Sam, Riley", "The message"] },
    DigestCopy: { mod: await import("@/emails/DigestCopy"), expect: ["Alex posted the Electric bill", "25.17", "Sam, Riley"] },
  };
  for (const [name, { mod, expect }] of Object.entries(templates)) {
    const Component = mod.default as unknown as ((p: object) => React.ReactElement) & { PreviewProps: object };
    try {
      const el = createElement(Component, Component.PreviewProps);
      const html = (await render(el)).replaceAll("<!-- -->", "");
      const text = await render(el, { plainText: true });
      const missing = expect.filter((s) => !html.includes(s));
      r.check(`${name} renders with what the recipient needs`, missing.length === 0 && text.length > 50, missing.join(", "));
    } catch (e) {
      r.check(`${name} renders`, false, e instanceof Error ? e.message : String(e));
    }
  }
}
