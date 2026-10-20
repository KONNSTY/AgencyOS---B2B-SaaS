/**
 * locationVerification.js
 * AgencyOS - Zero-Trust Double Verification Middleware (IP Country vs. Frontend Timezone)
 * Implements Purchasing Power Parity (PPP) Pricing Gating & Anti-VPN Spoofing Protection.
 */

const https = require('https');

// =============================================================================
// 1. PPP COUNTRY & REGION TIERS CONFIGURATION
// =============================================================================
const PPP_TIERS = {
    TIER_1: {
        id: 'TIER_1',
        name: 'High Purchasing Power (e.g. 29€ / $29)',
        priceEnvKey: 'STRIPE_PRICE_ID_TIER_1',
        defaultPriceId: process.env.STRIPE_PRICE_ID_TIER_1 || process.env.STRIPE_PRICE_ID || 'price_tier1_default_29',
        countries: [
            'DE', 'US', 'FR', 'GB', 'CA', 'AU', 'AT', 'CH', 'NL', 'SE',
            'DK', 'NO', 'BE', 'IE', 'NZ', 'FI', 'LU', 'SG', 'AE', 'HK'
        ]
    },
    TIER_2: {
        id: 'TIER_2',
        name: 'Medium Purchasing Power (e.g. 19€ / $19)',
        priceEnvKey: 'STRIPE_PRICE_ID_TIER_2',
        defaultPriceId: process.env.STRIPE_PRICE_ID_TIER_2 || 'price_tier2_medium_19',
        countries: [
            'ES', 'JP', 'IT', 'PL', 'PT', 'KR', 'TW', 'CZ', 'GR', 'HU',
            'RO', 'HR', 'SK', 'SI', 'EE', 'LT', 'LV', 'CY', 'MT', 'IL', 'SA'
        ]
    },
    TIER_3: {
        id: 'TIER_3',
        name: 'Emerging Markets / Low Purchasing Power (e.g. 9€ / $9)',
        priceEnvKey: 'STRIPE_PRICE_ID_TIER_3',
        defaultPriceId: process.env.STRIPE_PRICE_ID_TIER_3 || 'price_tier3_emerging_9',
        countries: [
            'ID', 'CN', 'IN', 'VN', 'TH', 'PH', 'BR', 'MX', 'MY', 'CO',
            'AR', 'CL', 'PE', 'EG', 'NG', 'PK', 'BD', 'TR', 'ZA', 'KE'
        ]
    }
};

// =============================================================================
// 2. TIMEZONE TO EXPECTED REGION / COUNTRY MAPPING
// =============================================================================
const TIMEZONE_TO_COUNTRY_MAP = {
    // Germany / DACH / Western Europe (Tier 1)
    'Europe/Berlin': ['DE', 'AT', 'CH'],
    'Europe/Vienna': ['AT'],
    'Europe/Zurich': ['CH'],
    'Europe/Paris': ['FR', 'MC'],
    'Europe/London': ['GB'],
    'America/New_York': ['US', 'CA'],
    'America/Chicago': ['US', 'CA'],
    'America/Los_Angeles': ['US', 'CA'],
    'America/Toronto': ['CA'],
    'Australia/Sydney': ['AU'],
    'Australia/Melbourne': ['AU'],
    'Pacific/Auckland': ['NZ'],
    'Asia/Singapore': ['SG'],
    'Asia/Hong_Kong': ['HK'],
    
    // Tier 2 (Spain, Japan, Italy, Poland, etc.)
    'Europe/Madrid': ['ES'],
    'Asia/Tokyo': ['JP'],
    'Europe/Rome': ['IT'],
    'Europe/Warsaw': ['PL'],
    'Europe/Lisbon': ['PT'],
    'Asia/Seoul': ['KR'],
    'Asia/Taipei': ['TW'],
    'Europe/Athens': ['GR'],

    // Tier 3 (Indonesia, China, India, Brazil, etc.)
    'Asia/Jakarta': ['ID'],
    'Asia/Makassar': ['ID'],
    'Asia/Jayapura': ['ID'],
    'Asia/Shanghai': ['CN'],
    'Asia/Chongqing': ['CN'],
    'Asia/Kolkata': ['IN'],
    'Asia/Calcutta': ['IN'],
    'Asia/Bangkok': ['TH', 'VN'],
    'Asia/Ho_Chi_Minh': ['VN'],
    'Asia/Manila': ['PH'],
    'Asia/Kuala_Lumpur': ['MY'],
    'America/Sao_Paulo': ['BR'],
    'America/Mexico_City': ['MX'],
    'America/Bogota': ['CO'],
    'Africa/Cairo': ['EG'],
    'Africa/Lagos': ['NG'],
    'Europe/Istanbul': ['TR']
};

/**
 * Fast lookup to get country code from a client IP address
 */
async function resolveIpCountry(req) {
    // 1. Check Cloud Edge Headers (Vercel, Cloudflare, CloudFront, Google App Engine)
    const cloudCountry = 
        req.headers['x-vercel-ip-country'] ||
        req.headers['cf-ipcountry'] ||
        req.headers['x-appengine-country'] ||
        req.headers['cloudfront-viewer-country'] ||
        req.headers['x-country-code'];

    if (cloudCountry && cloudCountry.length === 2 && cloudCountry !== 'XX' && cloudCountry !== 'T1') {
        return cloudCountry.toUpperCase();
    }

    // 2. Extract client IP address
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = (forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || '';

    // Handle Localhost / Development IP
    if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.')) {
        // In local development, check if a dev country override was passed or default to DE
        return process.env.DEV_IP_COUNTRY || 'DE';
    }

    // 3. Fallback Geo-IP Lookup for bare servers
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('DE'), 1200); // 1.2s timeout fallback

        const sanitizedIp = clientIp.replace(/[^0-9a-fA-F:.]/g, '');
        const url = `https://ipapi.co/${sanitizedIp}/country/`;

        https.get(url, { headers: { 'User-Agent': 'AgencyOS-PPP-Verify/1.0' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                const code = data.trim().toUpperCase();
                if (code.length === 2 && !code.includes('UNDEFINED')) {
                    resolve(code);
                } else {
                    resolve('DE');
                }
            });
        }).on('error', () => {
            clearTimeout(timeout);
            resolve('DE');
        });
    });
}

/**
 * Double Verification Middleware
 * Compares client Timezone with detected IP Country.
 */
async function doubleVerificationMiddleware(req, res, next) {
    try {
        const clientTimezone = (req.body && req.body.timezone) ? String(req.body.timezone).trim() : 'Europe/Berlin';
        const detectedIpCountry = await resolveIpCountry(req);

        let isSpoofed = false;
        let mismatchReason = null;

        // Anti-Spoofing Rule:
        // Check if the provided Timezone exists in our map
        const expectedCountries = TIMEZONE_TO_COUNTRY_MAP[clientTimezone];

        if (expectedCountries) {
            // Case A: User connects from an emerging market IP (Tier 3, e.g. ID, CN, IN),
            // but their system timezone is Europe/Berlin, America/New_York or Europe/London (VPN evasion)
            const isHighWealthTimezone = ['Europe/Berlin', 'America/New_York', 'Europe/London', 'Europe/Paris', 'America/Los_Angeles', 'Australia/Sydney'].includes(clientTimezone);
            const isTier3Ip = PPP_TIERS.TIER_3.countries.includes(detectedIpCountry);

            if (isHighWealthTimezone && isTier3Ip) {
                isSpoofed = true;
                mismatchReason = `High-tier timezone (${clientTimezone}) detected on Tier-3 emerging market IP (${detectedIpCountry}). Anti-VPN triggered.`;
            }

            // Case B: Direct geographic divergence (e.g. IP says Germany, but Timezone says Asia/Jakarta)
            if (!expectedCountries.includes(detectedIpCountry) && !isSpoofed) {
                // If the IP country is in Tier 1 and timezone is Tier 3 or vice versa, flag it
                const ipTier = getTierForCountry(detectedIpCountry);
                const tzPrimaryCountry = expectedCountries[0];
                const tzTier = getTierForCountry(tzPrimaryCountry);

                if (ipTier.id !== tzTier.id) {
                    isSpoofed = true;
                    mismatchReason = `IP Country (${detectedIpCountry}, ${ipTier.id}) does not match Timezone (${clientTimezone}, expected: ${expectedCountries.join('/')}, ${tzTier.id}).`;
                }
            }
        }

        // Determine Final PPP Tier:
        // Anti-Spoofing Rule: If spoofing is flagged, ALWAYS default to TIER 1 (High Price)
        let verifiedTier;
        if (isSpoofed) {
            console.warn(`🛡️ [PPP Anti-Spoofing Warning] ${mismatchReason} -> Defaulting to TIER 1.`);
            verifiedTier = PPP_TIERS.TIER_1;
        } else {
            verifiedTier = getTierForCountry(detectedIpCountry);
        }

        // Attach verified PPP data to request object
        req.pppVerification = {
            tierId: verifiedTier.id,
            tierName: verifiedTier.name,
            stripePriceId: verifiedTier.defaultPriceId,
            detectedIpCountry,
            clientTimezone,
            isSpoofed,
            mismatchReason
        };

        console.log(`🌍 [PPP Verification] IP: ${detectedIpCountry} | Timezone: ${clientTimezone} | Result: ${verifiedTier.id} (${verifiedTier.defaultPriceId}) | Spoofed: ${isSpoofed}`);

        next();
    } catch (err) {
        console.error('❌ [PPP Verification Error]:', err.message);
        // Fail-safe: Always fall back to Tier 1 on internal error
        req.pppVerification = {
            tierId: PPP_TIERS.TIER_1.id,
            tierName: PPP_TIERS.TIER_1.name,
            stripePriceId: PPP_TIERS.TIER_1.defaultPriceId,
            detectedIpCountry: 'UNKNOWN',
            clientTimezone: 'UNKNOWN',
            isSpoofed: false,
            mismatchReason: 'Internal Error Fallback'
        };
        next();
    }
}

/**
 * Helper to match a 2-letter ISO Country Code to PPP Tier
 */
function getTierForCountry(countryCode) {
    const code = (countryCode || '').toUpperCase();

    if (PPP_TIERS.TIER_1.countries.includes(code)) {
        return PPP_TIERS.TIER_1;
    }
    if (PPP_TIERS.TIER_2.countries.includes(code)) {
        return PPP_TIERS.TIER_2;
    }
    if (PPP_TIERS.TIER_3.countries.includes(code)) {
        return PPP_TIERS.TIER_3;
    }

    // Default for unlisted countries is Tier 3 (Emerging) or Tier 1 depending on security policy.
    // For fair global access, standard default is Tier 3 unless flagged.
    return PPP_TIERS.TIER_3;
}

module.exports = {
    PPP_TIERS,
    TIMEZONE_TO_COUNTRY_MAP,
    resolveIpCountry,
    getTierForCountry,
    doubleVerificationMiddleware
};
