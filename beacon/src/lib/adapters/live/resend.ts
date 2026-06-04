import type { EmailAdapter, SendEmailInput, SendEmailResult } from "../types.js";
import { env } from "../../env.js";

export class ResendEmailAdapter implements EmailAdapter {
  readonly name = "resend-email";

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!env.resend.apiKey) {
      throw new Error("Resend live provider selected but RESEND_API_KEY is unset");
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resend.apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend email failed: ${res.status}`);
    const json = (await res.json()) as { id: string };
    return { providerMessageId: json.id, status: "sent" };
  }
}
