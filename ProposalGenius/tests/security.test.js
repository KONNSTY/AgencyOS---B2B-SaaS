const test = require('node:test');
const assert = require('node:assert/strict');
const {
    escapeHtml,
    sanitizeProposalHtml,
    safeHttpsUrl,
    safeStripeHostedUrl,
    isTrustedStripeUrl,
    isSafeHexColor,
    isSafeImageUrl,
    parsePngDataUrl
} = require('../public/htmlSanitize');
const {
    isPrivateAddress,
    clientIp,
    tokensMatch,
    normalizeDocumentType,
    isFollowUpEnabled,
    subscriptionIncludesAgencyPrice,
    invoiceIncludesAgencyPrice,
    validateOutboundUrl
} = require('../securityUtils');
const { resolveIpCountry } = require('../locationVerification');

test('proposal HTML drops active content and keeps allowed markup', () => {
    const dirty = [
        '<h2 class="mt-4" onclick="alert(1)">Plan</h2>',
        '<p>Hello <script>alert(1)</script><strong>team</strong></p>',
        '<scr<script>ipt>alert(1)</scr<script>ipt>',
        '<img src=x onerror="alert(1)">',
        '<table><tr><td style="width: 35%; background:url(javascript:alert(1))">Phase</td></tr></table>',
        '<a href="javascript:alert(1)">click</a>'
    ].join('');
    const clean = sanitizeProposalHtml(dirty);
    assert.match(clean, /<h2 class="mt-4">Plan<\/h2>/);
    assert.match(clean, /<strong>team<\/strong>/);
    assert.match(clean, /style="width: 35%"/);
    assert.doesNotMatch(clean, /script|onerror|onclick|javascript:|background/i);
    assert.equal(sanitizeProposalHtml('<p>' + escapeHtml('<script>') + '</p>'), '<p>&lt;script&gt;</p>');
});

test('image, color, and Stripe URL checks reject active payloads', () => {
    assert.equal(isSafeHexColor('#2563eb'), true);
    assert.equal(isSafeHexColor('red; } body{}'), false);
    assert.equal(isSafeImageUrl('javascript:alert(1)'), false);
    assert.equal(isSafeImageUrl('https://cdn.example.com/logo.png'), true);
    assert.equal(safeHttpsUrl('http://example.com/a'), '');
    assert.equal(safeStripeHostedUrl('https://invoice.stripe.com/i/acct_123'), 'https://invoice.stripe.com/i/acct_123');
    assert.equal(safeStripeHostedUrl('https://evil.example/invoice'), '');
    assert.equal(isTrustedStripeUrl('https://checkout.stripe.com/c/pay/cs_test'), true);
    assert.equal(isTrustedStripeUrl('https://checkout.stripe.com.evil.example/'), false);
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString('base64');
    assert.match(parsePngDataUrl('data:image/png;base64,' + png), /^data:image\/png;base64,/);
    assert.equal(parsePngDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), '');
});

test('private and alternative addresses are blocked', () => {
    for (const address of [
        '127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.5.5', '169.254.169.254',
        '0.0.0.0', '100.64.0.1', '255.255.255.255', '::1', '::ffff:127.0.0.1',
        'fc00::1', 'fe80::1', 'localhost', 'metadata.google.internal', '2130706433'
    ]) {
        assert.equal(isPrivateAddress(address), true, address);
    }
    assert.equal(isPrivateAddress('8.8.8.8'), false);
    assert.equal(isPrivateAddress('2001:4860:4860::8888'), false);
});

test('client IP ignores forwarded headers unless the peer is a local proxy', () => {
    const publicPeer = clientIp({
        headers: { 'x-forwarded-for': '1.2.3.4' },
        socket: { remoteAddress: '8.8.8.8' }
    });
    assert.equal(publicPeer, '8.8.8.8');

    const proxied = clientIp({
        headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.9' },
        socket: { remoteAddress: '10.0.0.8' }
    });
    assert.equal(proxied, '203.0.113.9');
});

test('proposal tokens must be present and equal', () => {
    assert.equal(tokensMatch('', ''), false);
    assert.equal(tokensMatch('abc', ''), false);
    assert.equal(tokensMatch('abc', 'abd'), false);
    assert.equal(tokensMatch('abc123', 'abc123'), true);
});

test('document type, follow-up flag, and price checks stay on the allowlist', () => {
    assert.equal(normalizeDocumentType('invoice'), 'invoice');
    assert.equal(normalizeDocumentType('freeProposalsUsed'), 'proposal');
    assert.equal(normalizeDocumentType('a.b'), 'proposal');
    assert.equal(isFollowUpEnabled(false), false);
    assert.equal(isFollowUpEnabled({ enabled: false }), false);
    assert.equal(isFollowUpEnabled({ enabled: true }), true);

    const env = { AGENCY_OS_PRICE_EUR_MONTHLY: 'price_eur', AGENCY_OS_PRICE_IDR_MONTHLY: 'price_idr' };
    assert.equal(subscriptionIncludesAgencyPrice({ items: { data: [{ price: { id: 'price_other' } }] } }, env), false);
    assert.equal(subscriptionIncludesAgencyPrice({ items: { data: [{ price: { id: 'price_eur' } }] } }, env), true);
    assert.equal(invoiceIncludesAgencyPrice({ lines: { data: [{ price: { id: 'price_idr' } }] } }, env), true);
});

test('outbound URLs must be HTTPS and resolve only to public addresses', async () => {
    const lookup = async () => [{ address: '1.1.1.1', family: 4 }];
    const accepted = await validateOutboundUrl('https://hooks.example.com/path', { lookup });
    assert.equal(accepted, 'https://hooks.example.com/path');
    await assert.rejects(() => validateOutboundUrl('http://hooks.example.com/path', { lookup, isProduction: true }));
    await assert.rejects(() => validateOutboundUrl('https://user:pass@hooks.example.com/', { lookup }));
    await assert.rejects(() => validateOutboundUrl('https://127.0.0.1/latest', { lookup }));
    await assert.rejects(() => validateOutboundUrl('https://rebind.example.com/', {
        lookup: async () => [{ address: '169.254.169.254', family: 4 }]
    }));
});

test('country detection does not trust caller-supplied geo headers', async () => {
    const previous = process.env.DEV_IP_COUNTRY;
    delete process.env.DEV_IP_COUNTRY;
    try {
        const country = await resolveIpCountry({
            headers: {
                'x-country-code': 'ID',
                'cf-ipcountry': 'ID',
                'x-vercel-ip-country': 'ID'
            },
            socket: { remoteAddress: '127.0.0.1' }
        });
        assert.equal(country, 'DE');
    } finally {
        if (previous === undefined) delete process.env.DEV_IP_COUNTRY;
        else process.env.DEV_IP_COUNTRY = previous;
    }
});
