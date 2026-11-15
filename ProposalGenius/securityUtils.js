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
        const octets = normalized.split('.').map(Number);
        const [a, b, c] = octets;
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

    if (net.isIPv6(normalized)) {
        if (normalized === '::' || normalized === '::1') return true;
        const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        if (/^(?:fc|fd|fe80|ff)/.test(normalized)) return true;
        if (normalized.startsWith('2001:db8:') || normalized.startsWith('64:ff9b:1:')) return true;
        return false;
    }

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
    validateOutboundUrl,
    safeOutboundFetch
};
