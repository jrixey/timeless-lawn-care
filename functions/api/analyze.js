// ================================================
// Yard Analyzer — Cloudflare Pages Function
// POST /api/analyze
// Receives yard photo + zip, calls Claude Vision API,
// returns structured yard assessment, logs lead to Formspree.
// ================================================

const YARD_ANALYSIS_PROMPT = `You are a friendly, knowledgeable lawn care expert in the Kansas City area giving a free consultation based on a photo of someone's yard. Your goal is to be genuinely helpful, like a neighbor who happens to know a lot about lawns. Never judge or grade the yard. Just give useful, specific advice.

Analyze this yard photo and return a JSON response with the following structure:

{
  "internalScore": <number 1-100, for internal use only, never shown to the homeowner>,
  "grassType": "<your best assessment of the grass type(s) visible, e.g. 'Tall Fescue', 'Kentucky Bluegrass / Fescue mix', 'Bermuda', 'Zoysia', 'Mixed cool-season grasses', etc. If unclear, say so honestly>",
  "summary": "<2-3 sentence friendly overview of what you see. Focus on positives first, then areas for improvement. Conversational tone, like talking to a neighbor.>",
  "observations": [
    {
      "category": "<Grass Type & Health | Mowing & Height | Edging & Borders | Weeds & Bare Spots | Overall Appearance>",
      "observation": "<specific, helpful observation about this aspect, 2-3 sentences. Be educational. Explain WHY something matters, not just what you see.>"
    }
  ],
  "recommendations": [
    {
      "title": "<short action title, e.g. 'Raise Your Mowing Height', 'Overseed This Fall', 'Spot-Treat Broadleaf Weeds'>",
      "priority": "<high | medium | low>",
      "details": "<specific, actionable advice for the Kansas City climate. Include timing, product types, or techniques when relevant. 2-3 sentences.>"
    }
  ],
  "mowingTip": "<specific mowing advice based on what you see: recommended mowing height, frequency for this grass type and season, and any pattern/technique tips. 2-3 sentences.>",
  "seasonalNote": "<what the homeowner should be thinking about right now based on the current KC season. Reference specific months and tasks. 2-3 sentences.>"
}

Guidelines:
- Be warm, encouraging, and educational. You are giving free advice, not grading a test.
- Never use language like "score", "grade", "rating", or "needs improvement". Instead use phrases like "here's what I notice" and "here's what I'd recommend".
- If the photo is not of a yard or is too unclear to analyze, set internalScore to 0 and explain in the summary.
- Identify the grass type if possible. This is Kansas City, so expect cool-season grasses like tall fescue, Kentucky bluegrass, or a mix. Mention if you see warm-season grasses like bermuda or zoysia.
- If you see specific weeds, name them (dandelion, clover, crabgrass, henbit, etc.) and suggest treatment.
- Mowing advice should be specific: height in inches, frequency per week, and whether to bag or mulch.
- Base everything on Kansas City's climate: zone 6a, hot humid summers, cold winters, fescue/bluegrass dominant.
- Provide exactly 3-5 observations and 3-4 recommendations.
- Always lead with something positive, even for yards that need a lot of work.
- Recommendations should reference specific timing (e.g. "in late September" not just "in fall").
- Return ONLY valid JSON. No markdown, no code fences, no extra text.`;

// KC metro zip codes (~50 mile radius) — only these can trigger a Claude API call
// Covers both MO and KS sides of the metro
const KC_METRO_ZIPS = new Set([
    // Missouri side
    '64002','64011','64012','64013','64014','64015','64016','64017','64018',
    '64022','64024','64028','64029','64030','64034','64035','64036',
    '64040','64048','64050','64051','64052','64053','64054','64055','64056',
    '64057','64058','64060','64062','64063','64064','64068','64069','64070','64071',
    '64072','64073','64074','64075','64077','64078','64079','64080','64081',
    '64082','64083','64084','64085','64086','64088','64089','64090','64092',
    '64098','64101','64102','64105','64106','64108','64109','64110',
    '64111','64112','64113','64114','64116','64117','64118','64119','64120','64121',
    '64123','64124','64125','64126','64127','64128','64129','64130','64131','64132',
    '64133','64134','64136','64137','64138','64139','64141','64144','64145','64146',
    '64147','64148','64149','64150','64151','64152','64153','64154','64155','64156',
    '64157','64158','64161','64162','64163','64164','64165','64166','64167','64168',
    '64170','64171','64179','64180','64184','64187','64188','64190','64191','64195',
    '64196','64197','64198','64199','64429','64439','64444','64454','64465','64477',
    '64492','64493','64701','64734','64739','64743','64746','64747',
    // Kansas side
    '66002','66006','66007','66008','66010','66012','66013','66014','66018','66019',
    '66020','66021','66025','66026','66027','66030','66031','66036',
    '66050','66051',
    '66052','66053','66054','66056','66058','66060','66061','66062','66063','66064',
    '66066','66067','66070','66071','66073','66075','66078','66079','66083','66085',
    '66086','66087','66090','66091','66092','66093','66094','66095','66097','66101',
    '66102','66103','66104','66105','66106','66109','66110','66111','66112','66113',
    '66115','66117','66118','66119','66160','66201','66202','66203','66204','66205',
    '66206','66207','66208','66209','66210','66211','66212','66213','66214','66215',
    '66216','66217','66218','66219','66220','66221','66222','66223','66224','66225',
    '66226','66227','66250','66251','66276','66282','66283','66285','66286',
]);

// Simple in-memory rate limiting (per-isolate, resets on cold start)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // 5 requests per IP per hour

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return true;
    }

    entry.count++;
    return false;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(clientIP)) {
        return new Response(
            JSON.stringify({ error: 'Too many requests. Please try again later.' }),
            { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }

    try {
        const body = await request.json();
        const { image, mediaType, zipCode, name, phone, email } = body;

        // Validate required fields
        if (!image || !mediaType) {
            return new Response(
                JSON.stringify({ error: 'Image is required.' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Validate media type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(mediaType)) {
            return new Response(
                JSON.stringify({ error: 'Invalid image type.' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Reject oversized payloads (base64 image should be under 5MB)
        if (image.length > 5 * 1024 * 1024 * 1.37) {
            return new Response(
                JSON.stringify({ error: 'Image too large. Please upload a smaller photo.' }),
                { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        if (!zipCode || !/^\d{5}$/.test(zipCode)) {
            return new Response(
                JSON.stringify({ error: 'Valid 5-digit zip code is required.' }),
                { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Block non-KC-metro zip codes from using the API
        if (!KC_METRO_ZIPS.has(zipCode)) {
            return new Response(
                JSON.stringify({ error: 'This tool is currently available for the Northland Kansas City area only. Check back as we expand!' }),
                { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Check for API key
        const apiKey = env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error('ANTHROPIC_API_KEY not set in environment');
            return new Response(
                JSON.stringify({ error: 'Service configuration error. Please try again later.' }),
                { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Call Claude Vision API
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 2048,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mediaType,
                                    data: image,
                                },
                            },
                            {
                                type: 'text',
                                text: YARD_ANALYSIS_PROMPT,
                            },
                        ],
                    },
                ],
            }),
        });

        if (!claudeResponse.ok) {
            const errText = await claudeResponse.text();
            console.error('Claude API error:', claudeResponse.status, errText);
            return new Response(
                JSON.stringify({ error: 'Analysis failed. Please try again.' }),
                { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        const claudeData = await claudeResponse.json();

        // Extract the text content from Claude's response
        const textBlock = claudeData.content?.find((b) => b.type === 'text');
        if (!textBlock || !textBlock.text) {
            return new Response(
                JSON.stringify({ error: 'No analysis returned. Please try a different photo.' }),
                { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Parse the JSON from Claude's response
        let analysisResult;
        try {
            // Strip any markdown code fences if present
            let jsonText = textBlock.text.trim();
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }
            analysisResult = JSON.parse(jsonText);
        } catch (parseErr) {
            console.error('JSON parse error:', parseErr, 'Raw text:', textBlock.text);
            return new Response(
                JSON.stringify({ error: 'Could not parse analysis. Please try again.' }),
                { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
        }

        // Log lead to Formspree (fire and forget)
        const formspreeId = env.FORMSPREE_ID || 'xaqdbwbp';
        logLead(formspreeId, {
            _subject: `Yard Analyzer Lead: ${zipCode} (Internal Score: ${analysisResult.internalScore || 'N/A'})`,
            zipCode,
            internalScore: analysisResult.internalScore,
            grassType: analysisResult.grassType || 'Unknown',
            name: name || 'Not provided',
            phone: phone || 'Not provided',
            email: email || 'Not provided',
            timestamp: new Date().toISOString(),
            source: 'Yard Analyzer Tool',
        });

        // Strip internalScore before sending to client (owner-only data, logged to Formspree)
        const { internalScore, ...clientResult } = analysisResult;

        return new Response(JSON.stringify(clientResult), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    } catch (err) {
        console.error('Unexpected error:', err);
        return new Response(
            JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
    }
}

// Handle CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        },
    });
}

// Fire-and-forget lead logging to Formspree
async function logLead(formspreeId, data) {
    try {
        await fetch(`https://formspree.io/f/${formspreeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(data),
        });
    } catch (err) {
        console.error('Formspree log error:', err);
    }
}
