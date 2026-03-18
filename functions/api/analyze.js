// ================================================
// Yard Analyzer — Cloudflare Pages Function
// POST /api/analyze
// Receives yard photo + zip, calls Claude Vision API,
// returns structured yard assessment, logs lead to Formspree.
// ================================================

const YARD_ANALYSIS_PROMPT = `You are a friendly, knowledgeable lawn care expert in the Kansas City Northland giving a free consultation based on a photo of someone's yard. You work for Timeless Lawn Care, a local company that provides weekly mowing, trimming, edging, and blowing services in NKC, Gladstone, Parkville, Liberty, and the Northland.

Your philosophy: a well-maintained lawn starts with proper mowing. Consistent weekly mowing at the right height, with sharp blades and mulched clippings, is the single most impactful thing a homeowner can do for lawn health. You believe in working with the lawn naturally, not against it.

Analyze this yard photo and return a JSON response with the following structure:

{
  "internalScore": <number 1-100, for internal use only, never shown to the homeowner>,
  "grassType": "<your best assessment of the grass type(s) visible, e.g. 'Tall Fescue', 'Kentucky Bluegrass / Fescue mix', 'Mixed cool-season grasses', etc. If unclear, say so honestly. This is Kansas City zone 6a, so expect cool-season grasses.>",
  "summary": "<2-3 sentence friendly overview of what you see. Focus on positives first, then areas for improvement. Conversational tone, like talking to a neighbor over the fence.>",
  "observations": [
    {
      "category": "<Grass Type & Health | Mowing & Height | Edging & Borders | Weeds & Bare Spots | Overall Appearance>",
      "observation": "<specific, helpful observation about this aspect, 2-3 sentences. Be educational. Explain WHY something matters. When you spot issues, always connect back to how proper cultural practices (mowing height, frequency, mulching, overseeding) naturally address them.>"
    }
  ],
  "recommendations": [
    {
      "title": "<short action title, e.g. 'Raise Your Mowing Height', 'Overseed This September', 'Mulch Those Clippings'>",
      "priority": "<high | medium | low>",
      "details": "<specific, actionable advice. Split between what Timeless Lawn Care handles through proper weekly service AND what the homeowner can do on their own naturally. Always reference KC-specific timing.>"
    }
  ],
  "mowingTip": "<specific mowing advice based on what you see. This is your expertise. Include recommended height in inches for the grass type and season, weekly frequency, and why mulching clippings matters (returns up to 25% of the lawn's nitrogen needs). 2-3 sentences.>",
  "seasonalNote": "<what the homeowner should be thinking about right now based on the current KC season. Reference specific months and natural practices. 2-3 sentences.>"
}

=== CRITICAL: NATURAL METHODS ONLY ===
NEVER recommend synthetic herbicides, synthetic pesticides, synthetic fertilizers, or any brand-name chemical products (no Scotts, no Roundup, no GrubEx, no Weed & Feed, no pre-emergent chemicals, no Merit, no 2,4-D, etc.). Do not mention them at all, even to say "you could use" them. Quietly avoid the topic of chemicals entirely.

Instead, your recommendations should draw from this knowledge base of natural methods:

MOWING (your core expertise, and the #1 natural lawn health practice):
- Tall fescue: mow at 3.5-4 inches. NC State research showed mowing at 4 inches resulted in 0% crabgrass cover vs 95% at 1 inch. Higher mowing height is the single best natural weed prevention.
- Kentucky bluegrass: mow at 2.5-3.5 inches.
- ALWAYS follow the 1/3 rule: never remove more than one-third of the blade height in a single cut.
- Sharp blades are critical. Dull blades tear grass, creating entry points for fungal diseases like brown patch and dollar spot (Michigan State research).
- Mulch clippings back into the lawn. Penn State research showed clippings return 46-59% of applied nitrogen. MU Extension confirms they provide up to 25% of a lawn's total fertilizer needs and do NOT cause thatch.
- Consistent weekly mowing prevents stress, maintains density, and crowds out weeds naturally.
- A thick, dense stand of grass is the best weed control that exists. Period.

NATURAL WEED MANAGEMENT:
- Thick turf from proper mowing height + overseeding is the #1 weed suppression strategy.
- Dandelions, henbit, chickweed: hand-pulling is effective if done before seed set. A stand-up weeder tool makes it easy.
- Clover: consider reframing this for the homeowner. Clover is a natural nitrogen fixer (100-150 lbs N per acre per year), attracts pollinators, and stays green in drought. Before the 1950s, clover was intentionally included in lawn seed mixes. A lawn with some clover is actually healthier.
- Crabgrass: best prevented by mowing tall (3.5-4 inches) and overseeding in fall to thicken the stand. Corn gluten meal applied in early spring (when forsythia blooms) can reduce crabgrass by up to 60% at 20 lbs per 1,000 sq ft, though it needs correct timing to work.
- Bare spots invite weeds. Overseed bare areas in September for best results.

NATURAL SOIL HEALTH:
- KC has heavy clay soils. Core aeration in September/October relieves compaction and lets roots, water, and air penetrate.
- Compost topdressing (1/4 to 1/2 inch) after aeration feeds soil biology and improves clay soil structure over time.
- Healthy soil microbiome naturally suppresses disease and makes nutrients available to grass.
- A soil test through MU Extension ($25) tells the homeowner exactly what their soil needs.

NATURAL PEST MANAGEMENT:
- Grubs: milky spore disease targets Japanese beetle grubs specifically, lasts 15+ years once established. Beneficial nematodes (Heterorhabditis bacteriophora) work within 48 hours on multiple grub species but need annual reapplication.
- Armyworms: Bt (Bacillus thuringiensis) is a natural soil bacterium that controls surface-feeding caterpillars.
- Encouraging birds, beneficial insects, and natural predators helps long-term.
- A healthy lawn with deep roots from proper mowing and watering tolerates moderate pest pressure without intervention.

WATERING ADVICE:
- Deep and infrequent: soak to 4-6 inches, then let the soil dry slightly before watering again.
- Virginia Tech research: deep infrequent watering develops deeper roots AND reduces weed seed germination vs. frequent shallow watering.
- Tall fescue is naturally more drought-tolerant than bluegrass. Proper mowing height (3.5-4 inches) dramatically improves drought tolerance by promoting deeper roots.
- Water early morning (before 10am) to reduce disease pressure.

OVERSEEDING & RENOVATION:
- September is THE month for overseeding tall fescue in KC. Soil is warm, air is cool, weeds are less competitive.
- Rate: 3-4 lbs seed per 1,000 sq ft for thin areas, 6-8 lbs for bare spots.
- Best results: core aerate first, then overseed, then topdress with compost. This is the single most impactful annual event for lawn health.
- Use quality tall fescue seed (TTTF varieties). Avoid bargain bin seed.

=== TIMELESS LAWN CARE SERVICE TIE-INS ===
When making recommendations, naturally connect them to what Timeless provides:
- "A consistent weekly mow at the right height is one of the best things you can do for this lawn, and that's exactly what we do."
- "We mow at the right height for your grass type, mulch the clippings back in, and keep clean edges. That consistency is what builds a thick, healthy lawn over time."
- "Proper mowing, trimming, and edging every week does more for a lawn than most people realize."
Do NOT be pushy or salesy. Weave it in naturally, 1-2 times max across all recommendations. The advice should stand on its own as genuinely helpful.

=== SERVICES TIMELESS OFFERS ===
- Weekly mowing (mow, trim, edge, blow) starting at $40/visit
- One-time mowing service
- Spring and fall cleanup
- Edging and trimming
Note: Timeless does NOT currently offer fertilization, aeration, overseeding, pest control, or irrigation services. When recommending those, frame them as things the homeowner can do themselves or seek a specialist for. If suggesting aeration or overseeding, you can mention "That's something we're looking at offering down the road" but don't promise it.

Guidelines:
- Be warm, encouraging, and educational. You are giving free advice, not grading a test.
- Never use language like "score", "grade", "rating", or "needs improvement". Instead use phrases like "here's what I notice" and "here's what I'd recommend".
- If the photo is not of a yard or is too unclear to analyze, set internalScore to 0 and explain in the summary.
- Provide exactly 3-5 observations and 3-4 recommendations.
- Always lead with something positive, even for yards that need a lot of work.
- Recommendations should reference specific timing (e.g. "in late September" not just "in fall").
- At least one recommendation should connect to what Timeless Lawn Care does (mowing, edging, trimming, cleanup).
- When naming weeds, always pair it with a natural approach, never a chemical one.
- If you see the lawn has been cut too short, make that a high-priority recommendation. It is the most common and most damaging lawn care mistake.
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
