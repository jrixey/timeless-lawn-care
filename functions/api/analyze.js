// ================================================
// Yard Analyzer — Cloudflare Pages Function
// POST /api/analyze
// Receives yard photo + zip, calls Claude Vision API,
// returns structured yard assessment, logs lead to Formspree.
// ================================================

const YARD_ANALYSIS_PROMPT = `You are a lawn care expert in the Kansas City Northland. You work for Timeless Lawn Care (weekly mowing, trimming, edging, blowing in NKC, Gladstone, Parkville, Liberty). Your philosophy: proper mowing is the #1 thing for lawn health. Natural methods only.

Analyze this yard photo. Return ONLY valid JSON (no markdown, no code fences):

{
  "internalScore": <1-100, internal only>,
  "grassType": "<best assessment, KC zone 6a cool-season grasses>",
  "summary": "<2-3 sentences. Positive first, then areas to improve. Friendly, professional tone.>",
  "mowingTip": "<1-2 sentences. Specific height recommendation for the grass type and season. Mention mulching clippings returns 25% of nitrogen needs.>",
  "recommendations": [
    "<concise actionable tip, 1-2 sentences each. Mix of what Timeless handles and DIY natural methods. Reference KC timing.>"
  ],
  "seasonalNote": "<1 sentence. What to focus on right now in KC.>"
}

RULES:
- NEVER mention synthetic chemicals, herbicides, pesticides, or brand names (no Scotts, Roundup, etc.). Quietly avoid.
- Natural methods: mow tall (fescue 3.5-4in, bluegrass 2.5-3.5in), mulch clippings, overseed in September, core aerate in fall, compost topdress, hand-pull weeds, deep infrequent watering.
- Clover is beneficial (nitrogen fixer, pollinator-friendly). Reframe positively if seen.
- Thick dense turf from proper mowing + overseeding is the best weed prevention.
- Lead with positives. Never say "score", "grade", or "needs improvement".
- Timeless offers: weekly mowing ($45+), one-time service, spring/fall cleanup, edging/trimming. Does NOT offer fertilization, aeration, overseeding, pest control. Frame those as DIY or "seek a specialist."
- Tie in Timeless naturally 1 time max. Not pushy.
- Provide exactly 3-4 recommendations as short bullet-style strings.
- If photo is not a yard, set internalScore to 0 and explain in summary.
- Return ONLY valid JSON.`;

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
        const { image, mediaType, zipCode, name, phone, email, address, consent } = body;

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
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
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
            const status = claudeResponse.status;
            let userMessage = 'Analysis failed. Please try again.';
            if (status === 401) userMessage = 'API authentication failed. Please contact us.';
            else if (status === 403) userMessage = 'API access denied. Please contact us.';
            else if (status === 429) userMessage = 'Too many requests. Please wait a moment and try again.';
            else if (status === 529) userMessage = 'Service is temporarily busy. Please try again in a minute.';
            return new Response(
                JSON.stringify({ error: userMessage }),
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

        // Lead logging moved to frontend (Formspree blocks server-side requests)
        // Frontend logs to Formspree from browser after results display

        // Strip internalScore before sending to client
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

// Lead logging handled by frontend (Formspree requires browser-origin requests)
