const crypto = require('crypto');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');

const DOCUMENT_TYPES = new Set(['proposal', 'briefing', 'contract', 'roadmap', 'signoff', 'invoice']);

function normalizeIp(address) {
    let ip = String(address || '').trim().toLowerCase();
    if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
    if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
    const zone = ip.indexOf('%');
    if (zone !== -1) ip = ip.slice(0, zone);
    return ip;
}

function isPrivateIPv4(octets) {
    const [a, b, c] = octets;
    if (octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 113) return true;
    if (a >= 224) return true;
    return false;
}

function ipv6Groups(address) {
    let input = normalizeIp(address);
    if (!input || !input.includes(':')) return null;

    const dotted = input.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (dotted) {
        const octets = dotted[2].split('.').map(Number);
        if (octets.some(part => part > 255)) return null;
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        input = `${dotted[1]}${high}:${low}`;
    }

    const halves = input.split('::');
    if (halves.length > 2) return null;
    const parseSide = (part) => {
        if (!part) return [];
        const groups = [];
        for (const piece of part.split(':')) {
            if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
            groups.push(parseInt(piece, 16));
        }
        return groups;
    };
    const head = parseSide(halves[0]);
    if (!head) return null;
    if (halves.length === 1) return head.length === 8 ? head : null;
    const tail = parseSide(halves[1]);
    if (!tail) return null;
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    return [...head, ...Array(missing).fill(0), ...tail];
}

function isPrivateIPv6(address) {
    const groups = ipv6Groups(address);
    if (!groups) return true;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    if (groups.every(group => group === 0) || (groups.slice(0, 7).every(group => group === 0) && g7 === 1)) return true;
    if ((g0 & 0xff00) === 0xff00) return true;
    if ((g0 & 0xfe00) === 0xfc00) return true;
    if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true;
    if (g0 === 0x2001 && (g1 === 0x0db8 || (g1 === 0x0002 && g2 === 0))) return true;
    if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true;
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
        return isPrivateIPv4([(g6 >> 8) & 255, g6 & 255, (g7 >> 8) & 255, g7 & 255]);
    }
    if (g0 === 0x2002) {
        return isPrivateIPv4([(g1 >> 8) & 255, g1 & 255, (g2 >> 8) & 255, g2 & 255]);
    }
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
        return isPrivateIPv4([(g6 >> 8) & 255, g6 & 255, (g7 >> 8) & 255, g7 & 255]);
    }
    return false;
}

function isPrivateAddress(address) {
    const normalized = normalizeIp(address);
    if (!normalized) return true;
    if (
        normalized === 'localhost'
        || normalized.endsWith('.localhost')
        || normalized.endsWith('.local')
        || normalized.endsWith('.internal')
    ) return true;
    if (/^\d+$/.test(normalized) || /^0x[0-9a-f.]+$/i.test(normalized)) return true;

    if (net.isIPv4(normalized)) {
        return isPrivateIPv4(normalized.split('.').map(Number));
    }

    if (normalized.includes(':')) return isPrivateIPv6(normalized);
    return false;
}

function socketAddress(req) {
    return normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
}

function clientIp(req) {
    const peer = socketAddress(req);
    if (!peer || !isPrivateAddress(peer)) return peer;
    const hops = String(req?.headers?.['x-forwarded-for'] || '')
        .split(',')
        .map(part => normalizeIp(part))
        .filter(part => net.isIP(normalizeIp(part).replace(/^::ffff:/, '')));
    if (!hops.length) return peer;
    const trustedHops = Math.max(1, Math.min(Number(process.env.TRUSTED_PROXY_HOPS || 1) || 1, 5));
    return hops[Math.max(0, hops.length - trustedHops)];
}

function tokensMatch(stored, provided) {
    const left = Buffer.from(String(stored || ''));
    const right = Buffer.from(String(provided || ''));
    if (left.length === 0 || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function normalizeDocumentType(value) {
    const type = String(value || '').trim().toLowerCase();
    return DOCUMENT_TYPES.has(type) ? type : 'proposal';
}

function isFollowUpEnabled(value) {
    if (value && typeof value === 'object') return value.enabled !== false;
    return value !== false;
}

function clipText(value, max) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function agencyPriceIds(env = process.env) {
    return new Set([
        env.AGENCY_OS_PRICE_EUR_MONTHLY,
        env.AGENCY_OS_PRICE_USD_MONTHLY,
        env.AGENCY_OS_PRICE_IDR_MONTHLY,
        env.AGENCY_OS_PRICE_SGD_MONTHLY,
        env.AGENCY_OS_PRICE_AUD_MONTHLY
    ].filter(Boolean));
}

function subscriptionIncludesAgencyPrice(subscription, env = process.env) {
    const prices = agencyPriceIds(env);
    return (subscription?.items?.data || []).some(item => prices.has(item?.price?.id));
}

function invoiceIncludesAgencyPrice(invoice, env = process.env) {
    const prices = agencyPriceIds(env);
    const lines = invoice?.lines?.data || [];
    return lines.some(line => prices.has(line?.price?.id || line?.pricing?.price_details?.price));
}

function checkoutPriceId(country, isSpoofed, env = process.env) {
    if (isSpoofed) return env.AGENCY_OS_PRICE_EUR_MONTHLY || '';
    const code = String(country || '').toUpperCase();
    const priceByCountry = {
        US: env.AGENCY_OS_PRICE_USD_MONTHLY,
        AU: env.AGENCY_OS_PRICE_AUD_MONTHLY,
        SG: env.AGENCY_OS_PRICE_SGD_MONTHLY,
        ID: env.AGENCY_OS_PRICE_IDR_MONTHLY
    };
    return priceByCountry[code] || env.AGENCY_OS_PRICE_EUR_MONTHLY || '';
}

async function lookupAddresses(hostname, lookup) {
    const resolver = lookup || ((host, options) => dns.lookup(host, options));
    const records = await resolver(hostname, { all: true, verbatim: true });
    return (Array.isArray(records) ? records : [records])
        .map(entry => (typeof entry === 'string' ? entry : entry?.address))
        .filter(Boolean);
}

async function validateOutboundUrl(rawUrl, { allowHttp = false, lookup, isProduction = process.env.NODE_ENV === 'production' } = {}) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        throw new Error('WEBHOOK_URL_REJECTED');
    }

    const protocols = ['https:'];
    if (allowHttp && !isProduction) protocols.push('http:');
    if (!protocols.includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error('WEBHOOK_URL_REJECTED');
    }
    if (isPrivateAddress(parsed.hostname)) throw new Error('WEBHOOK_URL_REJECTED');

    let addresses = [];
    try {
        addresses = await lookupAddresses(parsed.hostname, lookup);
    } catch {
        throw new Error('WEBHOOK_URL_REJECTED');
    }
    if (!addresses.length || addresses.some(address => isPrivateAddress(address))) {
        throw new Error('WEBHOOK_URL_REJECTED');
    }
    return parsed.toString();
}

function safeOutboundFetch(rawUrl, options = {}) {
    const { lookup, allowHttp, isProduction, signal, method = 'GET', headers = {}, body = null } = options;
    return validateOutboundUrl(rawUrl, { allowHttp, lookup, isProduction }).then(async (safeUrl) => {
        const parsed = new URL(safeUrl);
        const addresses = await lookupAddresses(parsed.hostname, lookup);
        if (!addresses.length || addresses.some(address => isPrivateAddress(address))) {
            throw new Error('WEBHOOK_URL_REJECTED');
        }
        const pinned = normalizeIp(addresses[0]);
        const family = net.isIP(pinned);
        const transport = parsed.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const request = transport.request({
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port || undefined,
                path: `${parsed.pathname}${parsed.search}`,
                method,
                headers,
                lookup(hostname, _options, callback) {
                    if (hostname !== parsed.hostname) {
                        callback(new Error('WEBHOOK_URL_REJECTED'));
                        return;
                    }
                    callback(null, pinned, family);
                }
            }, (response) => {
                response.resume();
                resolve({
                    ok: response.statusCode >= 200 && response.statusCode < 300,
                    status: response.statusCode,
                    statusText: response.statusMessage || '',
                    body: { cancel: () => Promise.resolve() }
                });
            });

            const fail = (error) => {
                request.destroy();
                reject(error);
            };
            request.setTimeout(8000, () => fail(new Error('WEBHOOK_TIMEOUT')));
            request.on('error', reject);
            if (signal) {
                if (signal.aborted) return fail(new Error('WEBHOOK_ABORTED'));
                signal.addEventListener('abort', () => fail(new Error('WEBHOOK_ABORTED')), { once: true });
            }
            if (body) request.write(body);
            request.end();
        });
    });
}

module.exports = {
    DOCUMENT_TYPES,
    normalizeIp,
    isPrivateAddress,
    clientIp,
    tokensMatch,
    normalizeDocumentType,
    isFollowUpEnabled,
    clipText,
    agencyPriceIds,
    subscriptionIncludesAgencyPrice,
    invoiceIncludesAgencyPrice,
    checkoutPriceId,
    validateOutboundUrl,
    safeOutboundFetch
};
