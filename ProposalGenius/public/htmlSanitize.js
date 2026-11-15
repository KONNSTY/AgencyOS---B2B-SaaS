/**
 * Shared HTML and URL checks for server and browser.
 * Keeps proposal markup limited to the tags the generator is allowed to emit.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.AgencyHtml = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const ALLOWED_TAGS = new Set([
        'p', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'strong', 'em', 'b', 'i', 'br', 'span'
    ]);
    const ALLOWED_CLASSES = new Set([
        'mt-2', 'mt-4', 'mt-6', 'space-y-1', 'font-semibold', 'text-slate-400', 'italic'
    ]);
    const DANGEROUS_BLOCK = /<\s*(script|style|iframe|object|embed|link|meta|svg|math|form|textarea|button|input|select|video|audio|base|frame|frameset|noscript|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
    const DANGEROUS_SINGLE = /<\s*(script|style|iframe|object|embed|link|meta|svg|math|form|textarea|button|input|select|video|audio|base|frame|frameset|noscript|template)\b[^>]*>/gi;

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function plainText(value, max = 240) {
        return String(value ?? '')
            .replace(/[\u0000-\u001F\u007F]+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function attributeValue(raw, name) {
        const pattern = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
        const match = String(raw || '').match(pattern);
        return match ? (match[1] || match[2] || match[3] || '') : '';
    }

    function sanitizeAttributes(tag, rawAttrs) {
        const attrs = [];
        const classes = attributeValue(rawAttrs, 'class')
            .split(/\s+/)
            .filter(cls => ALLOWED_CLASSES.has(cls));
        if (classes.length) attrs.push('class="' + classes.join(' ') + '"');

        if (tag === 'th' || tag === 'td') {
            const style = attributeValue(rawAttrs, 'style');
            const width = style.match(/(?:^|;)\s*width\s*:\s*(\d{1,3})%\s*(?:;|$)/i);
            if (width && Number(width[1]) <= 100) {
                attrs.push('style="width: ' + width[1] + '%"');
            }
        }
        return attrs.length ? ' ' + attrs.join(' ') : '';
    }

    function sanitizeProposalHtml(input) {
        let html = String(input || '').replace(/\0/g, '');
        if (html.length > 200000) html = html.slice(0, 200000);
        html = html.replace(/<!--[\s\S]*?-->/g, '');

        let previous;
        do {
            previous = html;
            html = html.replace(DANGEROUS_BLOCK, '');
            html = html.replace(DANGEROUS_SINGLE, '');
        } while (html !== previous);

        html = html.replace(/<\/?\s*([a-zA-Z0-9:-]+)([^>]*)>/g, (full, rawTag, rawAttrs) => {
            const tag = String(rawTag || '').toLowerCase();
            if (!ALLOWED_TAGS.has(tag)) return '';
            if (/^<\s*\//.test(full)) return '</' + tag + '>';
            if (tag === 'br') return '<br>';
            return '<' + tag + sanitizeAttributes(tag, rawAttrs) + '>';
        });

        html = html.replace(/<(?!\/?(?:p|h2|h3|blockquote|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|strong|em|b|i|br|span)\b)[^>]*>/gi, '');
        return html;
    }

    function safeHttpUrl(value) {
        try {
            const url = new URL(String(value || '').trim());
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
            if (url.username || url.password) return '';
            if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return '';
            return url.toString();
        } catch {
            return '';
        }
    }

    function safeHttpsUrl(value) {
        const url = safeHttpUrl(value);
        if (!url || !url.startsWith('https://')) return '';
        return url;
    }

    function safeStripeHostedUrl(value) {
        const url = safeHttpsUrl(value);
        if (!url) return '';
        try {
            const host = new URL(url).hostname.toLowerCase();
            if (host === 'stripe.com' || host.endsWith('.stripe.com')) return url;
        } catch {
            return '';
        }
        return '';
    }

    function isTrustedStripeUrl(value) {
        const url = safeHttpsUrl(value);
        if (!url) return false;
        try {
            const host = new URL(url).hostname.toLowerCase();
            return host === 'checkout.stripe.com' || host === 'billing.stripe.com';
        } catch {
            return false;
        }
    }

    function isSafeHexColor(value) {
        return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
    }

    function isSafeImageUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return false;
        if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw) && !/^data:image\/svg/i.test(raw)) {
            return true;
        }
        return Boolean(safeHttpsUrl(raw));
    }

    function parsePngDataUrl(value, maxBytes = 500 * 1024) {
        const match = String(value || '').trim().match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i);
        if (!match) return '';
        const encoded = match[1].replace(/\s/g, '');
        if (!encoded || encoded.length > Math.ceil(maxBytes * 4 / 3) + 8) return '';
        if (typeof Buffer === 'undefined') return 'data:image/png;base64,' + encoded;
        const buffer = Buffer.from(encoded, 'base64');
        if (!buffer.length || buffer.length > maxBytes) return '';
        const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        if (!buffer.subarray(0, 8).equals(pngSignature)) return '';
        return 'data:image/png;base64,' + encoded;
    }

    return {
        escapeHtml,
        plainText,
        sanitizeProposalHtml,
        safeHttpUrl,
        safeHttpsUrl,
        safeStripeHostedUrl,
        isTrustedStripeUrl,
        isSafeHexColor,
        isSafeImageUrl,
        parsePngDataUrl
    };
});
