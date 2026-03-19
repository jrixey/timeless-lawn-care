// ================================================
// Send Yard Analysis Results Email — Cloudflare Pages Function
// POST /api/send-results
// Sends formatted yard analysis results to customer via Resend
// ================================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const body = await request.json();
        const { email, name, summary, grassType, mowingTip, recommendations, seasonalNote } = body;

        if (!email || !name) {
            return new Response(
                JSON.stringify({ error: 'Email and name are required.' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        const resendKey = env.RESEND_API_KEY;
        if (!resendKey) {
            console.error('RESEND_API_KEY not configured');
            return new Response(
                JSON.stringify({ error: 'Email service not configured.' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Build recommendations list
        const recsHtml = (recommendations || [])
            .map((r) => {
                const text = typeof r === 'string' ? r : (r.details || r.title || '');
                return `<li style="margin-bottom:8px;line-height:1.5;">${escapeHtml(text)}</li>`;
            })
            .join('');

        // Build the email HTML
        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e8e5e0;">
    <!-- Header -->
    <div style="background:#1A2A1A;padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#FAF8F4;font-size:22px;font-weight:600;">Your Yard Analysis Results</h1>
      <p style="margin:8px 0 0;color:#C5A55A;font-size:14px;">Timeless Lawn Care</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#2C2C2C;">Hi ${escapeHtml(name)},</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#2C2C2C;">Thanks for using our Yard Analyzer. Here's what we found:</p>

      <!-- Recommendations -->
      ${recsHtml ? `
      <div style="background:#f7f9f7;border-left:4px solid #5A7A5E;padding:16px 20px;margin-bottom:24px;border-radius:0 6px 6px 0;">
        <h2 style="margin:0 0 12px;font-size:16px;color:#1A2A1A;">What We'd Recommend</h2>
        <ul style="margin:0;padding-left:20px;color:#2C2C2C;font-size:14px;">${recsHtml}</ul>
      </div>
      ` : ''}

      <!-- Summary -->
      ${summary ? `
      <div style="margin-bottom:24px;">
        <h2 style="margin:0 0 8px;font-size:16px;color:#1A2A1A;">Summary</h2>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#2C2C2C;">${escapeHtml(summary)}</p>
      </div>
      ` : ''}

      <!-- Grass Type -->
      ${grassType ? `
      <div style="margin-bottom:24px;">
        <h2 style="margin:0 0 8px;font-size:16px;color:#1A2A1A;">Grass Type</h2>
        <p style="margin:0;font-size:14px;color:#2C2C2C;"><strong>${escapeHtml(grassType)}</strong></p>
      </div>
      ` : ''}

      <!-- Mowing Tip -->
      ${mowingTip ? `
      <div style="margin-bottom:24px;">
        <h2 style="margin:0 0 8px;font-size:16px;color:#1A2A1A;">Mowing Advice</h2>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#2C2C2C;">${escapeHtml(mowingTip)}</p>
      </div>
      ` : ''}

      <!-- Seasonal Note -->
      ${seasonalNote ? `
      <div style="background:#FFF9E6;padding:12px 16px;margin-bottom:24px;border-radius:6px;">
        <p style="margin:0;font-size:14px;line-height:1.5;color:#2C2C2C;"><strong>Right Now in KC:</strong> ${escapeHtml(seasonalNote)}</p>
      </div>
      ` : ''}

      <!-- CTA -->
      <div style="text-align:center;padding:24px 0 8px;border-top:1px solid #e8e5e0;">
        <p style="margin:0 0 16px;font-size:15px;color:#2C2C2C;">Want hands-on help with your lawn?</p>
        <a href="https://timelesslawncarellc.com/#contact" style="display:inline-block;background:#5A7A5E;color:#ffffff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Request a Free Estimate</a>
        <p style="margin:16px 0 0;font-size:13px;color:#777;">Or call/text us at <a href="tel:8162988348" style="color:#5A7A5E;">(816) 298-8348</a></p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#1A2A1A;padding:20px 24px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#7A917E;">Timeless Lawn Care | North Kansas City & the Northland</p>
      <p style="margin:6px 0 0;font-size:11px;color:#555;">You received this because you used our Yard Analyzer at timelesslawncarellc.com</p>
    </div>
  </div>
</body>
</html>`;

        // Send via Resend API
        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
                from: 'Timeless Lawn Care <noreply@timelesslawncarellc.com>',
                to: [email],
                subject: `Your Yard Analysis Results - Timeless Lawn Care`,
                html: html,
                reply_to: 'timelesslawncarellc@pm.me',
            }),
        });

        if (!resendResponse.ok) {
            const errText = await resendResponse.text();
            console.error('Resend error:', resendResponse.status, errText);
            return new Response(
                JSON.stringify({ error: 'Failed to send email. Please try again.' }),
                { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    } catch (err) {
        console.error('Send results error:', err);
        return new Response(
            JSON.stringify({ error: 'An unexpected error occurred.' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
