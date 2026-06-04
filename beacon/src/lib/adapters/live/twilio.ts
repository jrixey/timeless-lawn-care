import type {
  SmsAdapter,
  SendSmsInput,
  SendSmsResult,
  VoiceAdapter,
  PlaceCallInput,
  PlaceCallResult,
} from "../types.js";
import { env } from "../../env.js";

const BASE = "https://api.twilio.com/2010-04-01";

function authHeader(): string {
  const { accountSid, authToken } = env.twilio;
  if (!accountSid || !authToken) {
    throw new Error("Twilio live provider selected but TWILIO_ACCOUNT_SID/AUTH_TOKEN are unset");
  }
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

export class TwilioSmsAdapter implements SmsAdapter {
  readonly name = "twilio-sms";

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const body = new URLSearchParams({ To: input.to, Body: input.body });
    if (env.twilio.messagingServiceSid) {
      body.set("MessagingServiceSid", env.twilio.messagingServiceSid);
    } else {
      body.set("From", input.from);
    }
    const res = await fetch(`${BASE}/Accounts/${env.twilio.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
        // Twilio idempotency via header (best-effort).
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body,
    });
    if (!res.ok) throw new Error(`Twilio SMS failed: ${res.status}`);
    const json = (await res.json()) as { sid: string; status: string };
    return { providerMessageId: json.sid, status: "sent" };
  }
}

export class TwilioVoiceAdapter implements VoiceAdapter {
  readonly name = "twilio-voice";

  async placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
    const body = new URLSearchParams({
      To: input.to,
      From: input.from,
      Url: input.handlerRef ?? "http://demo.twilio.com/docs/voice.xml",
    });
    const res = await fetch(`${BASE}/Accounts/${env.twilio.accountSid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Twilio call failed: ${res.status}`);
    const json = (await res.json()) as { sid: string };
    return { providerCallId: json.sid, status: "in_progress" };
  }
}
