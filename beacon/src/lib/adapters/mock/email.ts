import type { EmailAdapter, SendEmailInput, SendEmailResult } from "../types.js";
import { outbox, mockId } from "./outbox.js";

export class MockEmailAdapter implements EmailAdapter {
  readonly name = "mock-email";

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const providerMessageId = mockId("em");
    const id = outbox.record(
      {
        kind: "email",
        to: input.to,
        from: input.from,
        subject: input.subject,
        text: input.text,
        providerMessageId,
        at: new Date().toISOString(),
      },
      input.idempotencyKey,
    );
    return { providerMessageId: id, status: "sent" };
  }
}
