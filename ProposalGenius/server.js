/**
 * AgencyOS - Hardened Node.js / Express Backend (Zero-Trust Architecture)
 * Features:
 * - Layer 1: Cryptographic Firebase Auth Token Verification & Zero-Risk Quota Gating
 * - Feature 1: E-Sign (Digital Signatures & Shareable Client Links)
 * - Feature 2: CRM & Zapier Integration (Outbound Webhooks for HubSpot, Pipedrive, Zapier, Make, Trello)
 * - Feature 3: Proposal Tracking & Real-Time Analytics
 * - Feature 4: Internationalization (i18n Multi-Language Engine: DE, EN, FR, ES)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { doubleVerificationMiddleware, PPP_TIERS } = require('./locationVerification');
const { sendEmail, sendPaymentFailedEmail, sendAccountDeletedEmail, sendFollowUpEmail, sendProposalSignedConfirmation, sendWelcomeEmail, sendSubscriptionConfirmedEmail } = require('./emailService');
const { startCronEngine, triggerSingleProposalFollowUp } = require('./cronService');
const dns = require('dns').promises;
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Google Gemini AI SDK
let geminiAI = null;
if (process.env.GEMINI_API_KEY) {
    try {
        geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log('🤖 [Gemini AI] Google Generative AI SDK erfolgreich initialisiert.');
    } catch (err) {
        console.warn('⚠️ [Gemini AI] Initialisierungsfehler:', err.message);
    }
} else {
    console.log('ℹ️ [Gemini AI] Kein GEMINI_API_KEY gefunden. Fallback auf deterministische Template Engine aktiv.');
}

// =============================================================================
// 1. FIREBASE ADMIN SDK INITIALISIERUNG
// =============================================================================
const fs = require('fs');

try {
    let serviceAccount = null;
    let sourceDesc = '';

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        sourceDesc = 'Environment Variable (FIREBASE_SERVICE_ACCOUNT)';
    } else {
        const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
            ? path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
            : path.join(__dirname, 'serviceAccountKey.json');

        if (fs.existsSync(explicitPath)) {
            serviceAccount = require(explicitPath);
            sourceDesc = path.basename(explicitPath);
        } else {
            // Auto-detect any *-firebase-adminsdk-*.json in root directory
            const rootFiles = fs.readdirSync(__dirname);
            const adminSdkFile = rootFiles.find(f => f.includes('firebase-adminsdk') && f.endsWith('.json'));
            if (adminSdkFile) {
                serviceAccount = require(path.join(__dirname, adminSdkFile));
                sourceDesc = adminSdkFile;
            }
        }
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log(`🔒 [Security] Firebase Admin SDK via ${sourceDesc} initialisiert.`);
    } else {
        admin.initializeApp();
        console.log('ℹ️ [Security] Firebase Admin SDK mit Standard-Credentials initialisiert.');
    }
} catch (error) {
    console.warn('⚠️ [Security Warning] Firebase Admin SDK Initialisierung:', error.message);
}

const db = admin.apps.length ? admin.firestore() : null;
const authAdmin = admin.apps.length ? admin.auth() : null;

// In-Memory Fallback Stores für lokale Entwicklungs-Tests ohne Firebase
const memoryProposals = new Map();
const memoryWebhooks = new Map();

// =============================================================================
// 2. STRIPE SDK INITIALISIERUNG
// =============================================================================
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const AGENCY_OS_PRICE_IDS = new Set([
    process.env.AGENCY_OS_PRICE_EUR_MONTHLY,
    process.env.AGENCY_OS_PRICE_USD_MONTHLY,
    process.env.AGENCY_OS_PRICE_IDR_MONTHLY,
    process.env.AGENCY_OS_PRICE_SGD_MONTHLY,
    process.env.AGENCY_OS_PRICE_AUD_MONTHLY
].filter(Boolean));

if (isProduction) {
    const missingStripeConfig = [];
    if (!STRIPE_SECRET_KEY || !/^sk_live_/.test(STRIPE_SECRET_KEY)) missingStripeConfig.push('STRIPE_SECRET_KEY (Live-Key)');
    if (!STRIPE_WEBHOOK_SECRET || !/^whsec_/.test(STRIPE_WEBHOOK_SECRET)) missingStripeConfig.push('STRIPE_WEBHOOK_SECRET');
    if (AGENCY_OS_PRICE_IDS.size < 5) missingStripeConfig.push('AGENCY_OS_PRICE_*_MONTHLY');
    if (missingStripeConfig.length) {
        throw new Error(`Produktionskonfiguration unvollständig: ${missingStripeConfig.join(', ')}`);
    }
}

const stripe = STRIPE_SECRET_KEY ? require('stripe')(STRIPE_SECRET_KEY) : null;

// =============================================================================
// 3. MIDDLEWARE & ZERO-TRUST AUTH-VERIFICATION
// =============================================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://www.gstatic.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com', 'https://securetoken.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://firebasestorage.googleapis.com'],
            frameSrc: ["'self'", 'https://accounts.google.com', 'https://*.firebaseapp.com'],
            formAction: ["'self'", 'https://checkout.stripe.com']
        }
    },
    crossOriginEmbedderPolicy: false
}));

const allowedOrigins = new Set(
    (process.env.AGENCY_OS_ALLOWED_ORIGINS || 'https://agencyos.com,https://www.agencyos.com')
        .split(',')
        .map(origin => origin.trim().replace(/\/$/, ''))
        .filter(Boolean)
);
if (!isProduction) {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
}
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed'));
    },
    credentials: true
}));

// --- Bot Protection & Rate Limiting ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per `window`
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const supportChatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'SUPPORT_RATE_LIMITED' }
});

// In-Memory Custom Domain Lookup Cache (Domain -> Branding Metadata)
const customDomainMap = new Map();

/**
 * Custom Domain & White-Label Interceptor Middleware
 * Ermittelt anhand des Hostnamens oder Query-Parameters das individuelle Branding
 */
const customDomainMiddleware = async (req, res, next) => {
    try {
        const rawHost = (req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
        const queryDomain = req.query.customDomain ? String(req.query.customDomain).toLowerCase() : null;
        const targetHost = queryDomain || rawHost;

        if (targetHost && targetHost !== 'localhost' && targetHost !== '127.0.0.1' && !targetHost.includes('agencyos') && !targetHost.includes('proposalgenius') && !targetHost.includes('onrender') && !targetHost.includes('vercel')) {
            let branding = customDomainMap.get(targetHost);

            if (!branding && db) {
                const snapshot = await db.collection('users')
                    .where('customDomain', '==', targetHost)
                    .limit(1)
                    .get();

                if (!snapshot.empty) {
                    const uData = snapshot.docs[0].data();
                    if (hasActiveProEntitlement(uData)) {
                        branding = {
                            userId: snapshot.docs[0].id,
                            agencyName: uData.agencyName || 'Agentur',
                            brandLogoUrl: uData.brandLogoUrl || '',
                            brandPrimaryColor: uData.brandPrimaryColor || '#2563eb',
                            hideBranding: uData.hideBranding !== false,
                            customDomain: targetHost
                        };
                        customDomainMap.set(targetHost, branding);
                    }
                }
            }

            if (branding) {
                req.customBranding = branding;
            }
        }
    } catch (err) {
        console.warn('⚠️ [Custom Domain Middleware] Fehler:', err.message);
    }
    next();
};

app.use(customDomainMiddleware);

const verifyFirebaseAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const idToken = authHeader.split('Bearer ')[1].trim();

    if (!authAdmin) {
        console.error('❌ [Zero-Trust] Firebase Admin ist nicht verfügbar. Anfrage wird abgelehnt.');
        return res.status(503).json({ error: 'AUTHENTICATION_UNAVAILABLE' });
    }

    try {
        const decodedToken = await authAdmin.verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (err) {
        console.error('❌ [Zero-Trust] Ungültiges oder abgelaufenes Firebase ID-Token:', err.message);
        return res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Ungültiges Authentifizierungs-Token. Bitte melde dich erneut an.'
        });
    }
};

const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.uid) {
        return res.status(401).json({
            error: 'AUTHENTICATION_REQUIRED',
            message: 'Diese Aktion erfordert eine gültige Authentifizierung.'
        });
    }
    next();
};

const requirePro = async (req, res, next) => {
    if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
    }

    if (!db) {
        return res.status(503).json({ error: 'ENTITLEMENT_BACKEND_UNAVAILABLE' });
    }

    if (db) {
        try {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            if (!userDoc.exists || !hasActiveProEntitlement(userDoc.data())) {
                return res.status(403).json({
                    error: 'PRO_REQUIRED',
                    message: 'Dieses Feature ist exklusiv für AgencyOS Pro-Abonnenten verfügbar.'
                });
            }
        } catch (e) {
            console.error('Fehler bei Pro-Prüfung:', e);
            return res.status(500).json({
                error: 'SERVER_ERROR',
                message: 'Fehler bei der Berechtigungsprüfung.'
            });
        }
    }
    next();
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function timestampToMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getAccessUntilMillis(data) {
    const explicitEnd = timestampToMillis(
        data.subscriptionAccessUntil || data.subscriptionCurrentPeriodEnd || data.currentPeriodEnd
    );
    if (explicitEnd) return explicitEnd;

    // Legacy AgencyOS records are bounded to the original 30-day entitlement;
    // a historical isPro flag must never create an unlimited subscription.
    const upgradedAt = timestampToMillis(data.upgradedAt);
    return upgradedAt ? upgradedAt + THIRTY_DAYS_MS : 0;
}

function hasActiveProEntitlement(data) {
    if (!data || data.isPro !== true) return false;
    const status = String(data.subscriptionStatus || 'active').toLowerCase();
    const allowedStatus = ['active', 'trialing', 'past_due'].includes(status);
    return allowedStatus && getAccessUntilMillis(data) > Date.now();
}

function periodEndFromStripeObject(subscription) {
    const unixSeconds = subscription?.current_period_end
        || subscription?.items?.data?.[0]?.current_period_end;
    return unixSeconds ? new Date(unixSeconds * 1000) : new Date(Date.now() + THIRTY_DAYS_MS);
}

function firestoreTimestamp(date) {
    return admin.firestore.Timestamp.fromDate(date);
}

function configuredAgencyPriceIds() {
    return new Set([
        process.env.AGENCY_OS_PRICE_EUR_MONTHLY,
        process.env.AGENCY_OS_PRICE_USD_MONTHLY,
        process.env.AGENCY_OS_PRICE_IDR_MONTHLY,
        process.env.AGENCY_OS_PRICE_SGD_MONTHLY,
        process.env.AGENCY_OS_PRICE_AUD_MONTHLY
    ].filter(Boolean));
}

function priceForCountry(country) {
    const code = String(country || '').toUpperCase();
    const priceByCountry = {
        US: process.env.AGENCY_OS_PRICE_USD_MONTHLY,
        AU: process.env.AGENCY_OS_PRICE_AUD_MONTHLY,
        SG: process.env.AGENCY_OS_PRICE_SGD_MONTHLY,
        ID: process.env.AGENCY_OS_PRICE_IDR_MONTHLY
    };
    return priceByCountry[code] || process.env.AGENCY_OS_PRICE_EUR_MONTHLY;
}

function isPrivateAddress(address) {
    const normalized = String(address || '').toLowerCase();
    if (normalized === 'localhost' || normalized === '::1' || normalized.endsWith('.local')) return true;
    if (net.isIPv4(normalized)) {
        const octets = normalized.split('.').map(Number);
        return octets[0] === 10
            || octets[0] === 127
            || (octets[0] === 169 && octets[1] === 254)
            || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] === 192 && octets[1] === 168);
    }
    return net.isIPv6(normalized)
        && (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80'));
}

async function validateOutboundUrl(rawUrl, { allowHttp = false } = {}) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        throw new Error('Ungültige Webhook-URL.');
    }
    if (!['https:', ...(allowHttp && !isProduction ? ['http:'] : [])].includes(parsed.protocol)) {
        throw new Error('Webhook-URLs müssen HTTPS verwenden.');
    }
    if (parsed.username || parsed.password || parsed.port === '0') {
        throw new Error('Webhook-URL enthält nicht erlaubte Verbindungsdaten.');
    }
    if (isPrivateAddress(parsed.hostname)) throw new Error('Private oder lokale Webhook-Ziele sind nicht erlaubt.');
    const addresses = await dns.lookup(parsed.hostname, { all: true });
    if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
        throw new Error('Webhook-Ziel konnte nicht sicher validiert werden.');
    }
    return parsed.toString();
}

async function claimStripeEvent(eventId) {
    if (!db || !eventId) return true;
    const ref = db.collection('stripe_events').doc(eventId);
    return db.runTransaction(async transaction => {
        const existing = await transaction.get(ref);
        if (existing.exists) return false;
        transaction.create(ref, {
            eventType: 'stripe',
            receivedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return true;
    });
}

async function releaseStripeEvent(eventId) {
    if (!db || !eventId) return;
    await db.collection('stripe_events').doc(eventId).delete().catch(() => {});
}

// =============================================================================
// 4. STRIPE WEBHOOK LISTENER
// =============================================================================
async function usersForStripeCustomer(customerId) {
    if (!db || !customerId) return [];
    const snapshot = await db.collection('users').where('stripeCustomerId', '==', customerId).get();
    return snapshot.docs;
}

async function writeAgencyProductAccess(userId, data) {
    if (!db || !userId) return;
    await db.collection('users').doc(userId).collection('productAccess').doc('agency_os').set({
        product: 'agency_os',
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function applySubscriptionState(subscription, overrides = {}) {
    if (!db || !subscription?.customer) return;

    const periodEnd = periodEndFromStripeObject(subscription);
    const status = String(overrides.status || subscription.status || 'active').toLowerCase();
    const accessUntil = overrides.accessUntil || periodEnd;
    const hasAccess = ['active', 'trialing', 'past_due'].includes(status)
        && accessUntil.getTime() > Date.now();
    const users = await usersForStripeCustomer(subscription.customer);

    for (const doc of users) {
        const profileUpdate = {
            isPro: hasAccess,
            plan: hasAccess ? 'agencyos_pro' : 'free',
            subscriptionStatus: status,
            subscriptionAccessUntil: firestoreTimestamp(accessUntil),
            subscriptionCurrentPeriodEnd: firestoreTimestamp(periodEnd),
            cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
            stripeSubscriptionId: subscription.id || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(hasAccess ? {} : { downgradedAt: admin.firestore.FieldValue.serverTimestamp() })
        };
        await doc.ref.set(profileUpdate, { merge: true });
        await writeAgencyProductAccess(doc.id, {
            plan: hasAccess ? 'agencyos_pro' : 'free',
            active: hasAccess,
            status,
            accessUntil: firestoreTimestamp(accessUntil),
            stripeSubscriptionId: subscription.id || null
        });
    }
}

async function applyPaidCheckoutSession(session) {
    const metadata = session.metadata || {};
    const userId = session.client_reference_id || metadata.userId;
    if (!userId || metadata.app !== 'agencyos') return false;
    if (session.payment_status && session.payment_status !== 'paid') return false;
    if (!db || !stripe || !session.subscription) return false;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    const acceptedPrices = configuredAgencyPriceIds();
    const hasAcceptedPrice = lineItems.data.some(item => acceptedPrices.has(item.price?.id));
    if (!hasAcceptedPrice) {
        throw new Error('Checkout enthält keinen gültigen AgencyOS-Preis.');
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const periodEnd = periodEndFromStripeObject(subscription);
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const profileUpdate = {
        uid: userId,
        isPro: ['active', 'trialing', 'past_due'].includes(String(subscription.status).toLowerCase())
            && periodEnd.getTime() > Date.now(),
        plan: 'agencyos_pro',
        stripeCustomerId: session.customer || subscription.customer || null,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status || 'active',
        subscriptionAccessUntil: firestoreTimestamp(periodEnd),
        subscriptionCurrentPeriodEnd: firestoreTimestamp(periodEnd),
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await userRef.set(profileUpdate, { merge: true });
    await writeAgencyProductAccess(userId, {
        plan: profileUpdate.isPro ? 'agencyos_pro' : 'free',
        active: profileUpdate.isPro,
        status: profileUpdate.subscriptionStatus,
        accessUntil: profileUpdate.subscriptionAccessUntil,
        stripeSubscriptionId: profileUpdate.stripeSubscriptionId
    });

    if (!userData.subscriptionConfirmationSentAt) {
        const customerEmail = session.customer_details?.email || session.customer_email || userData.email || userData.agencyEmail;
        const customerName = session.customer_details?.name || userData.displayName || userData.agencyName || 'Kunde';
        if (customerEmail) {
            await sendSubscriptionConfirmedEmail({
                to: customerEmail,
                name: customerName,
                portalUrl: `${process.env.BASE_URL || 'https://agencyos.com'}/index.html?openSettings=billing`
            });
            await userRef.set({ subscriptionConfirmationSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
    }
    return true;
}

app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        if (!stripe || !STRIPE_WEBHOOK_SECRET) {
            return res.status(503).json({ error: 'STRIPE_WEBHOOK_NOT_CONFIGURED' });
        }
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`❌ Stripe Webhook Signatur-Fehler: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`🔔 Stripe Webhook Event: ${event.type}`);
    let claimed = false;

    try {
        claimed = await claimStripeEvent(event.id);
        if (!claimed) return res.json({ received: true, duplicate: true });

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await applyPaidCheckoutSession(session);
                break;
            }

            case 'checkout.session.async_payment_succeeded': {
                await applyPaidCheckoutSession(event.data.object);
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                await applySubscriptionState(event.data.object);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await applySubscriptionState(subscription, {
                    status: 'canceled',
                    accessUntil: new Date()
                });
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                const hostedInvoiceUrl = invoice.hosted_invoice_url || '';
                let customerEmail = invoice.customer_email || '';
                let customerName = invoice.customer_name || 'Kunde';

                console.warn(`⚠️ [Payment Dunning] Zahlung fehlgeschlagen für Customer: ${customerId}`);

                if (db && customerId) {
                    const usersSnapshot = await db.collection('users').where('stripeCustomerId', '==', customerId).get();
                    for (const doc of usersSnapshot.docs) {
                        const uData = doc.data();
                        customerEmail = customerEmail || uData.email || uData.agencyEmail || '';
                        customerName = customerName !== 'Kunde' ? customerName : (uData.agencyName || uData.displayName || 'Kunde');
                        const accessUntil = getAccessUntilMillis(uData);
                        await doc.ref.set({
                            isPro: accessUntil > Date.now(),
                            plan: accessUntil > Date.now() ? 'agencyos_pro' : 'free',
                            subscriptionStatus: 'past_due',
                            paymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        await writeAgencyProductAccess(doc.id, {
                            plan: accessUntil > Date.now() ? 'agencyos_pro' : 'free',
                            active: accessUntil > Date.now(),
                            status: 'past_due',
                            accessUntil: accessUntil ? firestoreTimestamp(new Date(accessUntil)) : null,
                            stripeSubscriptionId: uData.stripeSubscriptionId || null
                        });
                    }
                }

                if (customerEmail) {
                    const baseUrl = process.env.BASE_URL || 'https://agencyos.com';
                    const portalDirectUrl = `${baseUrl}/index.html?openSettings=billing`;
                    await sendPaymentFailedEmail({
                        to: customerEmail,
                        name: customerName,
                        portalUrl: portalDirectUrl,
                        invoiceUrl: hostedInvoiceUrl
                    });
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                const customerId = invoice.customer;
                if (stripe && invoice.subscription) {
                    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                    await applySubscriptionState(subscription, { status: 'active' });
                } else if (db && customerId) {
                    const usersSnapshot = await db.collection('users').where('stripeCustomerId', '==', customerId).get();
                    for (const doc of usersSnapshot.docs) {
                        const accessUntil = getAccessUntilMillis(doc.data());
                        await doc.ref.set({
                            isPro: accessUntil > Date.now(),
                            plan: accessUntil > Date.now() ? 'agencyos_pro' : 'free',
                            subscriptionStatus: 'active',
                            subscriptionAccessUntil: accessUntil ? firestoreTimestamp(new Date(accessUntil)) : null,
                            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        await writeAgencyProductAccess(doc.id, {
                            plan: accessUntil > Date.now() ? 'agencyos_pro' : 'free',
                            active: accessUntil > Date.now(),
                            status: 'active',
                            accessUntil: accessUntil ? firestoreTimestamp(new Date(accessUntil)) : null,
                            stripeSubscriptionId: doc.data().stripeSubscriptionId || null
                        });
                    }
                }
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object;
                if (stripe && invoice.subscription) {
                    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                    await applySubscriptionState(subscription, { status: 'active' });
                }
                break;
            }
        }

        res.json({ received: true });
    } catch (handlerError) {
        if (claimed) await releaseStripeEvent(event.id);
        console.error('❌ Fehler in Webhook-Verarbeitung:', handlerError);
        res.status(500).json({ error: 'Webhook Handler Failed' });
    }
});

app.use(express.json({ limit: '10mb' }));
app.get('/index.html', (req, res) => {
    res.redirect(301, `/${req.originalUrl.slice('/index.html'.length)}`);
});
app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// SHARED POLYMATH ACCOUNT API
// =============================================================================
// The shared Firestore rules intentionally make profile writes server-only.
// AgencyOS therefore never writes users/{uid} or proposals from the browser.
const PROFILE_TEXT_LIMITS = {
    agencyName: 160,
    agencyEmail: 254,
    agencyPhone: 60,
    agencyAddress: 500,
    logoUrl: 2048,
    brandLogoUrl: 2048
};

function profileDefaults(user) {
    const email = user.email || '';
    const displayName = user.name || user.displayName || '';
    return {
        uid: user.uid,
        email,
        displayName,
        photoURL: user.picture || user.photoURL || '',
        isPro: false,
        plan: 'free',
        subscriptionStatus: 'none',
        freeProposalsUsed: 0,
        freeProposalsUsedByDocType: {},
        agencyName: displayName || 'Meine Agentur',
        agencyEmail: email,
        agencyPhone: '',
        agencyAddress: '',
        logoUrl: '',
        brandLogoUrl: '',
        brandPrimaryColor: '#2563eb',
        brandColor: '#2563eb',
        hideBranding: false,
        webhookUrl: '',
        webhookEvents: ['proposal.signed']
    };
}

function publicProfile(data, user) {
    return {
        ...data,
        uid: data.uid || user.uid,
        email: data.email || user.email || '',
        isPro: hasActiveProEntitlement(data),
        brandColor: data.brandColor || data.brandPrimaryColor || '#2563eb'
    };
}

app.get('/api/user/profile', verifyFirebaseAuth, requireAuth, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'PROFILE_BACKEND_UNAVAILABLE' });

    try {
        const userRef = db.collection('users').doc(req.user.uid);
        const userDoc = await userRef.get();
        let data;

        if (!userDoc.exists) {
            data = profileDefaults(req.user);
            await userRef.set({
                ...data,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            data = userDoc.data();
        }

        res.json({ success: true, profile: publicProfile(data, req.user) });
    } catch (error) {
        console.error('❌ Fehler beim Laden des Nutzerprofils:', error);
        res.status(500).json({ error: 'PROFILE_READ_FAILED' });
    }
});

app.post('/api/user/profile', verifyFirebaseAuth, requireAuth, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'PROFILE_BACKEND_UNAVAILABLE' });

    try {
        const incoming = req.body && typeof req.body === 'object' ? req.body : {};
        const update = {};

        for (const [field, limit] of Object.entries(PROFILE_TEXT_LIMITS)) {
            if (incoming[field] === undefined) continue;
            const value = String(incoming[field] || '').trim();
            if (value.length > limit) {
                return res.status(400).json({ error: 'PROFILE_FIELD_TOO_LONG', field });
            }
            if (['logoUrl', 'brandLogoUrl'].includes(field) && value) {
                let parsed;
                try { parsed = new URL(value); } catch { parsed = null; }
                if (!parsed || parsed.protocol !== 'https:') {
                    return res.status(400).json({ error: 'PROFILE_LOGO_URL_INVALID' });
                }
            }
            if (field === 'agencyEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return res.status(400).json({ error: 'PROFILE_EMAIL_INVALID' });
            }
            update[field] = value;
        }

        const brandColor = incoming.brandColor ?? incoming.brandPrimaryColor;
        if (brandColor !== undefined) {
            const normalizedColor = String(brandColor || '').trim();
            if (!/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
                return res.status(400).json({ error: 'PROFILE_COLOR_INVALID' });
            }
            update.brandColor = normalizedColor;
            update.brandPrimaryColor = normalizedColor;
        }

        if (incoming.hideBranding !== undefined) {
            update.hideBranding = Boolean(incoming.hideBranding);
        }

        const userRef = db.collection('users').doc(req.user.uid);
        await userRef.set({
            ...update,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const saved = await userRef.get();

        res.json({ success: true, profile: publicProfile(saved.data(), req.user) });
    } catch (error) {
        console.error('❌ Fehler beim Speichern des Nutzerprofils:', error);
        res.status(500).json({ error: 'PROFILE_WRITE_FAILED' });
    }
});

app.post('/api/user/logo', verifyFirebaseAuth, requireAuth, requirePro, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'PROFILE_BACKEND_UNAVAILABLE' });

    try {
        const raw = String(req.body?.dataUrl || '');
        const match = raw.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
        if (!match) return res.status(400).json({ error: 'LOGO_FORMAT_INVALID' });

        const contentType = match[1].toLowerCase();
        const buffer = Buffer.from(match[2], 'base64');
        if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
            return res.status(413).json({ error: 'LOGO_TOO_LARGE' });
        }

        const signatures = {
            'image/png': buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
            'image/jpeg': buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
            'image/gif': buffer.subarray(0, 6).toString('ascii') === 'GIF89a' || buffer.subarray(0, 6).toString('ascii') === 'GIF87a',
            'image/webp': buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
        };
        if (!signatures[contentType]) return res.status(400).json({ error: 'LOGO_CONTENT_INVALID' });

        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[contentType];
        const storageBucket = process.env.FIREBASE_STORAGE_BUCKET
            || `${process.env.FIREBASE_PROJECT_ID || 'polymath-productions'}.firebasestorage.app`;
        const bucket = admin.storage().bucket(storageBucket);
        const file = bucket.file(`logos/${req.user.uid}/${crypto.randomUUID()}.${extension}`);
        await file.save(buffer, {
            resumable: false,
            metadata: { contentType, cacheControl: 'private, max-age=3600' }
        });
        const [logoUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + (365 * 24 * 60 * 60 * 1000)
        });

        await db.collection('users').doc(req.user.uid).set({
            logoUrl,
            brandLogoUrl: logoUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ success: true, logoUrl });
    } catch (error) {
        console.error('❌ Fehler beim serverseitigen Logo-Upload:', error);
        res.status(500).json({ error: 'LOGO_UPLOAD_FAILED' });
    }
});

app.get('/api/user/export', verifyFirebaseAuth, requireAuth, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'PROFILE_BACKEND_UNAVAILABLE' });

    try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        const proposalsSnapshot = await db.collection('proposals')
            .where('userId', '==', req.user.uid)
            .limit(1000)
            .get();
        const profileData = userDoc.exists ? userDoc.data() : profileDefaults(req.user);
        const proposals = proposalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({
            success: true,
            userInfo: {
                uid: req.user.uid,
                email: req.user.email || '',
                displayName: req.user.name || req.user.displayName || '',
                creationTime: req.user.auth_time ? new Date(req.user.auth_time * 1000).toISOString() : null,
                lastSignInTime: null
            },
            profileData,
            proposals,
            exportDate: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Fehler beim Datenexport:', error);
        res.status(500).json({ error: 'DATA_EXPORT_FAILED' });
    }
});

// =============================================================================
// 5. FEATURE 2: OUTBOUND WEBHOOK & CRM DISPATCHER ENGINE
// =============================================================================

/**
 * Dispatcher für Outbound CRM & Zapier Webhooks
 */
async function dispatchOutboundWebhook(userId, eventName, payload) {
    if (!userId) return;

    try {
        let webhookConfig = null;

        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.webhookUrl && userData.webhookEnabled !== false) {
                    webhookConfig = {
                        url: userData.webhookUrl,
                        events: userData.webhookEvents || ['proposal.signed']
                    };
                }
            }
        } else {
            webhookConfig = memoryWebhooks.get(userId);
        }

        if (!webhookConfig || !webhookConfig.url) return;

        // Prüfen, ob der Event-Typ abonniert ist
        if (webhookConfig.events && !webhookConfig.events.includes(eventName) && !webhookConfig.events.includes('*')) {
            return;
        }

        const safeUrl = await validateOutboundUrl(webhookConfig.url);
        const webhookPayload = {
            event: eventName,
            eventId: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            eventTimestamp: new Date().toISOString(),
            data: payload
        };

        console.log(`📡 [Outbound Webhook] Sende "${eventName}" an Host: ${new URL(safeUrl).host}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(safeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'AgencyOS-Webhook-Dispatcher/2.0'
            },
            body: JSON.stringify(webhookPayload),
            signal: controller.signal
        });

        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log(`✅ [Outbound Webhook Success] Status: ${response.status} ${response.statusText}`);

    } catch (error) {
        console.warn(`⚠️ [Outbound Webhook Warning] Senden an Webhook fehlgeschlagen (${eventName}):`, error.message);
    }
}

// =============================================================================
// 6. HARDENED API ENDPUNKTE (FEATURE 4: i18n MULTI-LANGUAGE GENERATOR)
// =============================================================================

app.post('/api/generate', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const { clientName, projectGoals, deliverables, category, budget, deadline, agencyName, agencyEmail, language = 'de', tone = 'professional', documentType = 'proposal' } = req.body;

        if (!clientName || !projectGoals) {
            return res.status(400).json({ error: 'Kundenname und Projektziele sind erforderlich.' });
        }

        // Zero-Risk Quota Check (Type-Specific: 1 document of each type for Free tier)
        if (req.user && req.user.uid && db) {
            try {
                const userDoc = await db.collection('users').doc(req.user.uid).get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const isPro = hasActiveProEntitlement(userData);
                    const totalFreeUsed = userData.freeProposalsUsed || 0;

                    if (!isPro && totalFreeUsed >= 1) {
                        const docTypeNames = {
                            proposal: 'Angebot',
                            briefing: 'Briefing',
                            contract: 'Vertrag',
                            roadmap: 'Roadmap',
                            signoff: 'Abnahme',
                            invoice: 'Rechnung'
                        };
                        const currentName = docTypeNames[documentType] || 'Angebot';
                        console.log(`🛑 [Zero-Risk Block] User ${req.user.uid} hat Free-Limit für ${documentType} erreicht. LLM-Call abgebrochen.`);
                        return res.status(403).json({
                            error: 'PAYWALL_LIMIT_REACHED',
                            message: `Dein kostenloses ${currentName} ist aufgebraucht. Upgrade auf Pro (29€/Monat), um ab sofort unbegrenzt Dokumente zu generieren.`
                        });
                    }
                }
            } catch (quotaErr) {
                console.warn('⚠️ [Firestore Quota Check Warning] Konnte Quota nicht in Firestore abfragen:', quotaErr.message);
            }
        }

        const bulletPoints = String(projectGoals).split('\n').filter(line => line.trim().length > 0);
        const parsedBulletList = bulletPoints.map(item => `<li>${escapeHtml(item.replace(/^[-*•]\s*/, '').trim())}</li>`).join('');

        const deliverablePoints = deliverables ? String(deliverables).split('\n').filter(line => line.trim().length > 0) : [];
        const parsedDeliverablesList = deliverablePoints.map(item => `<li>${escapeHtml(item.replace(/^[-*•]\s*/, '').trim())}</li>`).join('');

        const safeClientName = escapeHtml(clientName);
        const safeAgencyName = escapeHtml(agencyName || 'Agency');
        const safeAgencyEmail = escapeHtml(agencyEmail || '');
        const safeCategory = escapeHtml(category || 'Web Development & Design');
        const safeBudget = escapeHtml(budget || 'As agreed');
        const safeDeadline = escapeHtml(deadline || '4-6 weeks');
        const safeDeliverables = deliverables ? escapeHtml(deliverables) : '';

        // KI-Feintuning Tone of Voice Guidelines
        const toneGuides = {
            professional: 'Professionell, seriös, vertrauensbildend, kaufmännisch fundiert und abschlussstark.',
            creative: 'Kreativ, dynamisch, inspirierend, metaphorisch stark und innovativ.',
            direct: 'Direkt, kompakt, ergebnisorientiert, fokussiert auf maximalen ROI, Effizienz und klare Zahlen/Fakten ohne Floskeln.',
            technical: 'Technisch tiefgehend, präzise, architekturfokussiert, mit Best Practices, Spezifikationen und Security-Standards.',
            luxury: 'Exklusiv, elegant, hochwertig und prestigeträchtig (High-Ticket Boutique Agency).'
        };
        const selectedToneGuide = toneGuides[tone] || toneGuides.professional;

        let generatedHTML = '';

        if (geminiAI) {
            try {
                const model = geminiAI.getGenerativeModel({ model: "gemini-flash-latest" });

                let docRoleGuide = 'hochkarätiger B2B-Proposal-Copywriter und Angebots-Stratege für Agenturen und Freelancer.';
                let docTypeGuide = 'ein extrem professionelles, abschlussstarkes und maßgeschneidertes B2B-Angebot';
                let docStructureGuide = `
1. Professionelle Begrüßung der Ansprechpartner bei ${safeClientName} und Einleitung durch ${safeAgencyName} mit Bezug auf die Ausgangslage.
2. <h2>1. Ausgangslage & Zielsetzung</h2> mit Zusammenfassung der aktuellen Situation und einem prägnanten <blockquote> der definierten Kernziele.
3. <h2>2. Leistungsumfang & Deliverables</h2>: Präsentiere den gesamten Leistungsumfang strukturiert als HTML-Tabelle (Spalten: Phase / Modul, Deliverables & Leistungsbestandteile, Ergebnis / Mehrwert). Binde alle vom Nutzer angegebenen Phasen und Deliverables vollständig und mit fachlicher Tiefe ein.
4. <h2>3. Zeitplan & Meilensteine</h2>: Detaillierter Ablaufplan passend zum Umsetzungszeitraum (${safeDeadline}) mit konkreten Meilensteinen von Kick-off bis Go-Live.
5. <h2>4. Investition & Zahlungsmodalitäten</h2>: Übersichtliche Netto-Kostenaufstellung über genau ${safeBudget} mit Zahlungsplan (z.B. 50% Anzahlung, 50% bei Übergabe/Launch).
6. <h2>5. Nächste Schritte</h2>: Klarer Call-to-Action zur Freigabe des Angebots und digitaler Signatur.`;

                if (documentType === 'briefing') {
                    docRoleGuide = 'hochkarätiger B2B-Anforderungs-Analyst, Project Scoper und Product Owner für Digital-Agenturen und Freelancer.';
                    docTypeGuide = 'ein detailliertes und professionelles Briefing- / Scoping-Protokoll (Anforderungsanalyse vor dem Angebot)';
                    docStructureGuide = `
1. Professionelle Einleitung über die durchgeführte Anforderungsanalyse für ${safeClientName}.
2. <h2>1. Ausgangslage & Herausforderungen</h2>: Zusammenfassung der aktuellen Situation und Probleme des Kunden.
3. <h2>2. Projekt-Ziele (KPIs)</h2>: Präzise Auflistung der wichtigsten Ziele als prägnante Bullet-Points.
4. <h2>3. Anforderungen & Scope</h2>: Strukturierte funktionale und technische Anforderungen.
5. <h2>4. Klärungsbedarf & Offene Fragen</h2>: Wichtige Rückfragen an den Kunden zur Vorbereitung des Angebots.
6. <h2>5. Nächste Schritte</h2>: Ablaufplan bis zur Angebotserstellung und geplanter Projektstart.`;
                } else if (documentType === 'contract') {
                    docRoleGuide = 'erfahrener IT-Vertragsgestalter und B2B-Rechtsexperte für Digitalagenturen und Freelancer.';
                    docTypeGuide = 'einen rechtssicheren Dienstleistungsvertrag und Statement of Work (SOW)';
                    docStructureGuide = `
1. Vertragskopf mit Bezeichnung der Vertragspartner (${safeAgencyName} und ${safeClientName}) und Datum.
2. <h2>1. Vertragsgegenstand</h2>: Beschreibung des vereinbarten Projekts im Bereich ${safeCategory}.
3. <h2>2. Leistungsumfang & Deliverables</h2>: Detaillierte HTML-Tabelle aller zu erbringenden Leistungen und Deliverables.
4. <h2>3. Vergütung & Zahlungsbedingungen</h2>: Netto-Honorar von ${safeBudget} und definierter Zahlungsplan (z.B. 50% Anzahlung, 50% nach Abnahme).
5. <h2>4. Mitwirkungspflichten & Urheberrechte</h2>: Pflichten des Kunden (Bereitstellung von Inhalten/Systemzugängen) und Übertragung der Verwertungsrechte nach vollständiger Bezahlung.
6. <h2>5. Haftung & Gewährleistung</h2>: Gesetzliche Standard-Klauseln für Agenturverträge.
7. <h2>6. Schlussbestimmungen & Unterschriften</h2>: Salvatorische Klausel und Aufforderung zur E-Signatur.`;
                } else if (documentType === 'roadmap') {
                    docRoleGuide = 'Customer Success Lead und Senior IT-Projektleiter für Digitalagenturen und Freelancer.';
                    docTypeGuide = 'eine professionelle Kickoff-Roadmap und einen Onboarding-Fahrplan für den Kunden';
                    docStructureGuide = `
1. Herzliche Begrüßung des Kunden ${safeClientName} und Onboarding-Einleitung durch ${safeAgencyName}.
2. <h2>1. Ansprechpartner & Kommunikation</h2>: Zuständigkeiten und Tools (z.B. wöchentliche Updates, Slack, E-Mail-Kommunikation unter ${safeAgencyEmail}).
3. <h2>2. Phasenweise Roadmap & Meilensteine</h2>: Schritt-für-Schritt-Ablaufplan für ${safeDeadline} in einer HTML-Tabelle mit Meilensteinen.
4. <h2>3. Erforderliche Zuarbeit des Kunden</h2>: Benötigte Zugänge, Bildmaterialien, Texte und Deadlines hierfür.
5. <h2>4. Kickoff-Meeting & Next Steps</h2>: Agenda für das Kickoff-Gespräch und erste Termine.`;
                } else if (documentType === 'signoff') {
                    docRoleGuide = 'Senior Product Manager und B2B-Projektleiter für Digitalagenturen und Freelancer.';
                    docTypeGuide = 'ein professionelles Projektabnahme- und Übergabeprotokoll (Abnahmeprotokoll)';
                    docStructureGuide = `
1. Einleitung mit Bezeichnung des abgenommenen Projekts für ${safeClientName} und Datum.
2. <h2>1. Abnahmegegenstand & Details</h2>: Übersicht der übergebenen digitalen Assets und Systeme.
3. <h2>2. Prüfkriterien & Abnahmeergebnis</h2>: HTML-Tabelle mit den getesteten Kriterien (z.B. Responsive Design, CMS-Schulung, Ladezeiten) und Status (Erfolgreich abgenommen / Nacharbeit).
4. <h2>3. Mängel & Restpunkte</h2>: Dokumentation eventueller Restarbeiten, die innerhalb von 14 Tagen behoben werden.
5. <h2>4. Abnahmeerklärung & Freigabe</h2>: Förmlicher Abnahmetext zur Unterzeichnung durch den Kunden.`;
                } else if (documentType === 'invoice') {
                    docRoleGuide = 'B2B-Finanzbuchhalter und kaufmännischer Berater für Digitalagenturen und Freelancer.';
                    docTypeGuide = 'eine ordnungsgemäße Rechnung / Vorab-Rechnung';
                    docStructureGuide = `
1. Rechnungs-Header (Absender ${safeAgencyName}, Empfänger ${safeClientName}, Rechnungs-Datum, Steuernummer/UstID-Platzhalter).
2. <h2>1. Leistungsübersicht</h2>: HTML-Tabelle der erbrachten Leistungen (Spalten: Position, Beschreibung, Menge/Einheit, Einzelpreis, Gesamtpreis netto).
3. <h2>2. Zusammenfassung der Kosten</h2>: Auflistung von Gesamt-Netto (${safeBudget}), zzgl. 19% MwSt. (wenn zutreffend) und Bruttobetrag.
4. <h2>3. Zahlungsziel & Bankverbindung</h2>: Zahlungsfrist (z.B. 14 Tage), Bankdaten (IBAN/BIC Platzhalter) und Verwendungszweck.
5. <h2>4. Steuerliche Hinweise & Schlusswort</h2>: Hinweis auf Steuerpflicht (z.B. Reverse-Charge bei Ausland oder Standard-MwSt.) und Dank für den Auftrag.`;
                }

                const prompt = `Du bist ein ${docRoleGuide}
Erstelle ${docTypeGuide} als sauberen HTML-Code (ausschließlich die HTML-Tags <p>, <h2>, <h3>, <blockquote>, <ul>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>, <em> verwenden; KEIN <html>, <head>, <body>, <!DOCTYPE> oder Markdown-Codeblöcke mit \`\`\`).

Projektdaten & Stilvorgaben aus allen Benutzereingaben:
- Zielsprache des Dokuments: ${language.toUpperCase()} (WICHTIG: Das gesamte Dokument muss fließend und muttersprachlich in dieser Sprache verfasst sein!)
- Gewählter Tonfall (Tone of Voice): ${tone.toUpperCase()} -> ${selectedToneGuide}
- Absender / Agentur: ${safeAgencyName} ${safeAgencyEmail ? `(${safeAgencyEmail})` : ''}
- Kunde / Auftraggeber: ${safeClientName}
- Projektbereich / Kategorie: ${safeCategory}
- Projektziele & Anforderungen (Vom Nutzer definiert):
${projectGoals}
- Konkreter Leistungsumfang & Deliverables (Vom Nutzer definierte Phasen & Arbeitspakete):
${safeDeliverables ? safeDeliverables : 'Erstelle ein passendes 4-Phasen-Modell basierend auf den Projektzielen'}
- Gesamtinvestition (Budget): ${safeBudget}
- Umsetzungszeitraum (Timeline / Deadline): ${safeDeadline}

Strikte Anweisung zur Erstellung des gesamten Dokuments im Tonfall "${tone}":
Verwende ausnahmslos alle oben genannten Daten des Nutzers (Kundenname, Agenturname, Kategorie, Ziele, Deliverables, Budget, Timeline) und verfasse daraus ein vollständiges, ausformuliertes und überzeugendes Dokument mit folgender Struktur:
${docStructureGuide}`;

                const result = await model.generateContent(prompt);
                let text = result.response.text();
                text = text.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').replace(/```/g, '').trim();
                generatedHTML = text;
                console.log(`✨ [Gemini AI] Erfolgreich individuelles Dokument (${documentType}) generiert für: ${safeClientName} (${language}, Tonfall: ${tone})`);
            } catch (geminiError) {
                console.warn('⚠️ [Gemini AI Fallback] Gemini API Fehler, nutze Vorlagen-Engine:', geminiError.message);
                generatedHTML = buildI18nDocumentHTML(documentType, language, {
                    clientName: safeClientName,
                    agencyName: safeAgencyName,
                    agencyEmail: safeAgencyEmail,
                    category: safeCategory,
                    budget: safeBudget,
                    deadline: safeDeadline,
                    bulletList: parsedBulletList,
                    deliverablesList: parsedDeliverablesList,
                    deliverablePoints: deliverablePoints
                });
            }
        } else {
            generatedHTML = buildI18nDocumentHTML(documentType, language, {
                clientName: safeClientName,
                agencyName: safeAgencyName,
                agencyEmail: safeAgencyEmail,
                category: safeCategory,
                budget: safeBudget,
                deadline: safeDeadline,
                bulletList: parsedBulletList,
                deliverablesList: parsedDeliverablesList,
                deliverablePoints: deliverablePoints
            });
        }

        // Zero-Risk Quota Increment (for Free tier users)
        if (req.user && req.user.uid && db) {
            try {
                const userRef = db.collection('users').doc(req.user.uid);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (!hasActiveProEntitlement(userData)) {
                        const updatePayload = {
                            freeProposalsUsed: admin.firestore.FieldValue.increment(1),
                            lastExportAt: admin.firestore.FieldValue.serverTimestamp()
                        };
                        updatePayload[`freeProposalsUsedByDocType.${documentType}`] = admin.firestore.FieldValue.increment(1);
                        await userRef.update(updatePayload);
                        console.log(`📊 [Quota] Generation atomar erhöht für Free-User: ${req.user.uid} (Typ: ${documentType})`);
                    }
                }
            } catch (err) {
                console.warn('⚠️ [Quota Update Warning] Konnte Quota nach Generation nicht inkrementieren:', err.message);
            }
        }

        res.json({
            success: true,
            html: generatedHTML,
            language: language,
            tone: tone,
            category: safeCategory,
            engine: geminiAI ? 'gemini-flash-latest' : 'template-engine'
        });

    } catch (error) {
        console.error('❌ [LLM Error] Fehler bei der Dokumentenerstellung:', error);
        res.status(500).json({ error: error.message });
    }
});

function buildI18nDocumentHTML(documentType, lang, data) {
    const buildDeliverablesTable = (defaultRows, phaseHeader = "Phase", descHeader = "Deliverables & Outcomes") => {
        if (data.deliverablePoints && data.deliverablePoints.length > 0) {
            return `<table>
                <thead>
                    <tr>
                        <th style="width: 35%;">${phaseHeader}</th>
                        <th>${descHeader}</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.deliverablePoints.map(dp => {
                const parts = dp.split(':');
                const phaseTitle = parts.length > 1 ? parts[0].replace(/^[-*•]\s*/, '').trim() : 'Phase / Deliverable';
                const phaseDesc = parts.length > 1 ? parts.slice(1).join(':').trim() : dp.replace(/^[-*•]\s*/, '').trim();
                return `<tr><td><strong>${escapeHtml(phaseTitle)}</strong></td><td>${escapeHtml(phaseDesc)}</td></tr>`;
            }).join('')}
                </tbody>
            </table>`;
        }
        return `<table>
            <thead>
                <tr>
                    <th style="width: 30%;">${phaseHeader}</th>
                    <th>${descHeader}</th>
                </tr>
            </thead>
            <tbody>
                ${defaultRows}
            </tbody>
        </table>`;
    };

    const isDe = lang === 'de';

    if (documentType === 'briefing') {
        if (isDe) {
            return `
                <p>Sehr geehrtes Team von <strong>${data.clientName}</strong>,</p>
                <p>vielen Dank für das Briefing-Gespräch. Im Folgenden findest du das Protokoll unserer Anforderungsanalyse für das Projekt <em>${data.category}</em>.</p>
                <h2>1. Ausgangslage & Herausforderungen</h2>
                <p>Der Kunde steht aktuell vor folgenden Herausforderungen, die im Projekt gelöst werden sollen:</p>
                <ul>
                    ${data.bulletList || '<li>Optimierungsbedarf beim digitalen Markenauftritt</li><li>Manuelle Workflows bremsen das Wachstum</li>'}
                </ul>
                <h2>2. Anforderungen & Deliverables</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Anforderung 1</strong></td><td>Erfassung aller funktionalen Kern-Features.</td></tr>
                    <tr><td><strong>Anforderung 2</strong></td><td>Definition von Schnittstellen und APIs.</td></tr>
                `, "Bereich", "Anforderungsdetails")}
                <h2>3. Zeitplan bis zum Angebot</h2>
                <p>Auf Basis dieses Scoping-Protokolls erstellen wir dir ein verbindliches Projektangebot bis zum <strong>${data.deadline}</strong>.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        } else {
            return `
                <p>Dear Team of <strong>${data.clientName}</strong>,</p>
                <p>Thank you for the briefing session. Below is the scoping protocol and requirement analysis for the project <em>${data.category}</em>.</p>
                <h2>1. Current Situation & Challenges</h2>
                <ul>
                    ${data.bulletList || '<li>Outdated brand presence</li><li>Inefficient manual workflows</li>'}
                </ul>
                <h2>2. Scope & Technical Requirements</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Requirement 1</strong></td><td>Core functional specifications.</td></tr>
                    <tr><td><strong>Requirement 2</strong></td><td>Integration and API mapping.</td></tr>
                `, "Area", "Details")}
                <h2>3. Next Steps</h2>
                <p>We will prepare a formal project proposal based on this scoping document by <strong>${data.deadline}</strong>.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        }
    } else if (documentType === 'contract') {
        if (isDe) {
            return `
                <p><strong>DIENSTLEISTUNGSVERTRAG</strong></p>
                <p>Zwischen <strong>${data.agencyName}</strong> (Auftragnehmer) und <strong>${data.clientName}</strong> (Auftraggeber) wird folgender Projektvertrag geschlossen.</p>
                <h2>1. Vertragsgegenstand</h2>
                <p>Gegenstand dieses Vertrages ist die Erbringung von Dienstleistungen im Bereich <em>${data.category}</em> gemäß der nachfolgenden Leistungsbeschreibung.</p>
                <h2>2. Leistungsumfang & Deliverables</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Konzeption & Design</strong></td><td>UI/UX Entwurf, Freigabeschleife.</td></tr>
                    <tr><td><strong>Umsetzung</strong></td><td>Technische Implementierung, Testing, Deployment.</td></tr>
                `, "Leistungsphase", "Vertragliche Deliverables")}
                <h2>3. Vergütung & Zahlungsplan</h2>
                <p>Für die vertragsgegenständlichen Leistungen vereinbaren die Parteien ein Pauschalhonorar von <strong>${data.budget}</strong> netto.</p>
                <p>Zahlbar zu 50% bei Projektstart, 50% bei finaler Übergabe.</p>
                <h2>4. Mitwirkungspflichten & Schlussbestimmungen</h2>
                <p>Der Auftraggeber stellt alle notwendigen Inhalte zeitnah bereit. Urheberrechte gehen mit vollständiger Zahlung auf den Auftraggeber über.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        } else {
            return `
                <p><strong>SERVICE AGREEMENT / STATEMENT OF WORK</strong></p>
                <p>This agreement is entered into by <strong>${data.agencyName}</strong> (Service Provider) and <strong>${data.clientName}</strong> (Client).</p>
                <h2>1. Subject Matter</h2>
                <p>The subject of this contract is the delivery of professional services in the area of <em>${data.category}</em>.</p>
                <h2>2. Scope & Deliverables</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Strategy & Design</strong></td><td>UX/UI mockups and interactive prototypes.</td></tr>
                    <tr><td><strong>Development</strong></td><td>Code implementation, testing, and production deployment.</td></tr>
                `, "Project Phase", "Deliverables / SOW")}
                <h2>3. Compensation & Billing Schedule</h2>
                <p>The total net budget for this SOW is set at <strong>${data.budget}</strong>.</p>
                <p>Terms: 50% deposit upon signature, 50% final payment upon launch.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        }
    } else if (documentType === 'roadmap') {
        if (isDe) {
            return `
                <p>Hallo Team von <strong>${data.clientName}</strong>,</p>
                <p>herzlich willkommen bei <strong>${data.agencyName}</strong>! Wir freuen uns auf das gemeinsame Projekt <em>${data.category}</em>. Hier ist unser Onboarding-Fahrplan für dich.</p>
                <h2>1. Kommunikations-Richtlinien</h2>
                <p>Wir kommunizieren primär über Slack und E-Mail (<strong>${data.agencyEmail || 'unser Support-Postfach'}</strong>). Wöchentlich erhältst du ein Status-Update.</p>
                <h2>2. Projekt-Roadmap</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Woche 1-2</strong></td><td>Kick-off & Designentwurf.</td></tr>
                    <tr><td><strong>Woche 3-5</strong></td><td>Entwicklung & Programmierung.</td></tr>
                    <tr><td><strong>Woche 6</strong></td><td>Qualitätssicherung & Launch.</td></tr>
                `, "Projektwoche", "Aktivitäten & Aufgaben")}
                <h2>3. Erforderliche Zuarbeit</h2>
                <p>Bitte stelle uns bis zum Kick-off Bildmaterial, Markenhandbuch und System-Zugänge bereit.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        } else {
            return `
                <p>Hello Team of <strong>${data.clientName}</strong>,</p>
                <p>Welcome to <strong>${data.agencyName}</strong>! We are excited to collaborate on <em>${data.category}</em>. Below is our kickoff roadmap and onboarding guide.</p>
                <h2>1. Collaboration & Communication</h2>
                <p>We will use Slack and email (<strong>${data.agencyEmail || 'our support address'}</strong>) for our primary communication.</p>
                <h2>2. Delivery Milestones</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Week 1-2</strong></td><td>Strategy, content structure & design direction.</td></tr>
                    <tr><td><strong>Week 3-5</strong></td><td>Technical development, CMS config, and testing.</td></tr>
                    <tr><td><strong>Week 6</strong></td><td>Launch QA, final review, and live release.</td></tr>
                `, "Timeline", "Milestones & Progress Tasks")}
                <h2>3. Client Action Items</h2>
                <p>Please provide brand assets, logos, copy, and server details prior to the kickoff session.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        }
    } else if (documentType === 'signoff') {
        if (isDe) {
            return `
                <p><strong>PROJEKT-ABNAHMEPROTOKOLL</strong></p>
                <p>Zwischen <strong>${data.agencyName}</strong> und <strong>${data.clientName}</strong> wird hiermit die förmliche Abnahme des Projekts <em>${data.category}</em> dokumentiert.</p>
                <h2>1. Abnahmegegenstand</h2>
                <p>Die vereinbarten Leistungen aus dem Hauptvertrag wurden vollständig übergeben und geprüft.</p>
                <h2>2. Abnahmeergebnis</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>UI/UX Design</strong></td><td>Erfolgreich abgenommen.</td></tr>
                    <tr><td><strong>Technische Funktion</strong></td><td>Erfolgreich abgenommen.</td></tr>
                    <tr><td><strong>SEO & Performance</strong></td><td>Erfolgreich abgenommen.</td></tr>
                `, "Prüfpunkt", "Status / Ergebnis")}
                <h2>3. Ausstehende Punkte / Mängel</h2>
                <p>Es wurden keine wesentlichen Mängel festgestellt. Kleinere Restpunkte werden im Rahmen der Gewährleistung behoben.</p>
                <h2>4. Abnahmeerklärung</h2>
                <p>Mit der digitalen Signatur bestätigt der Auftraggeber die vertragsgemäße Erbringung aller Leistungen.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        } else {
            return `
                <p><strong>PROJECT SIGN-OFF & ACCEPTANCE PROTOCOL</strong></p>
                <p>By signing this document, <strong>${data.clientName}</strong> formally accepts the completed deliverables for <em>${data.category}</em> from <strong>${data.agencyName}</strong>.</p>
                <h2>1. Acceptance Scope</h2>
                <p>All scope outlined in the Statement of Work has been fully tested and delivered.</p>
                <h2>2. Verification Details</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Front-end Visuals</strong></td><td>Verified & Approved.</td></tr>
                    <tr><td><strong>Technical Code & CMS</strong></td><td>Verified & Approved.</td></tr>
                `, "Deliverable Item", "Status / Inspection Result")}
                <h2>3. Open Tasks / Post-Launch Support</h2>
                <p>No critical defects. Minor remaining updates will be resolved under the standard support warranty.</p>
                <h2>4. Acceptance Declaration</h2>
                <p>The Client hereby declares the project completed and accepted in full.</p>
                <p class="mt-4 font-semibold">${data.agencyName}</p>
            `;
        }
    } else if (documentType === 'invoice') {
        if (isDe) {
            return `
                <p><strong>RECHNUNG / VORAB-RECHNUNG</strong></p>
                <p>Absender: <strong>${data.agencyName}</strong> (${data.agencyEmail})<br>Empfänger: <strong>${data.clientName}</strong></p>
                <h2>1. Leistungsaufstellung</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Projektumsetzung ${data.category}</strong></td><td>Pauschalhonorar laut Angebot.</td></tr>
                `, "Position", "Leistungsbeschreibung")}
                <h2>2. Gesamtsumme</h2>
                <p>Nettobetrag: <strong>${data.budget}</strong><br>zzgl. MwSt. falls anwendbar.</p>
                <h2>3. Zahlungsbedingungen</h2>
                <p>Bitte überweise den Betrag innerhalb von 14 Tagen (Fällig am: <strong>${data.deadline}</strong>) auf unsere Bankverbindung.</p>
                <p class="mt-4 font-semibold">Vielen Dank für den Auftrag!</p>
                <p class="font-semibold">${data.agencyName}</p>
            `;
        } else {
            return `
                <p><strong>INVOICE / PRE-INVOICE</strong></p>
                <p>From: <strong>${data.agencyName}</strong> (${data.agencyEmail})<br>To: <strong>${data.clientName}</strong></p>
                <h2>1. Itemized Services</h2>
                ${buildDeliverablesTable(`
                    <tr><td><strong>Project Services for ${data.category}</strong></td><td>Flat-rate contract fee.</td></tr>
                `, "Item", "Description")}
                <h2>2. Summary of Charges</h2>
                <p>Total Net Amount Due: <strong>${data.budget}</strong></p>
                <h2>3. Payment terms</h2>
                <p>Please settle this invoice within 14 days (Due date: <strong>${data.deadline}</strong>) via bank transfer.</p>
                <p class="mt-4 font-semibold">Thank you for your business!</p>
                <p class="font-semibold">${data.agencyName}</p>
            `;
        }
    } else {
        // proposal (default)
        switch (lang) {
            case 'en':
                return `
                    <p>Dear Team of <strong>${data.clientName}</strong>,</p>
                    <p>Thank you for the productive briefing session and your confidence in <strong>${data.agencyName}</strong>. Based on your specific business requirements, we have structured the following tailored commercial proposal for your project.</p>
                    
                    <h2>1. Project Objectives & Scope</h2>
                    <p>The primary objective within <em>${data.category}</em> is to deliver a cutting-edge, high-performing digital solution that drives measurable revenue and brand authority.</p>
                    
                    <blockquote>
                        <strong>Key Identified Goals & Requirements:</strong>
                        <ul class="mt-2 space-y-1">
                            ${data.bulletList || '<li>Complete modern digital brand overhaul</li><li>High-conversion lead generation & seamless user journey</li>'}
                        </ul>
                    </blockquote>

                    <h2>2. Scope of Work & Deliverables</h2>
                    <p>Our end-to-end execution framework includes all essential deliverables and phases:</p>
                    ${buildDeliverablesTable(`
                        <tr>
                            <td><strong>Phase 1: Strategy & UX/UI</strong></td>
                            <td>Information architecture, responsive wireframes, design system & brand styling.</td>
                        </tr>
                        <tr>
                            <td><strong>Phase 2: Development</strong></td>
                            <td>Clean-code frontend & backend development, CMS integration, speed optimization.</td>
                        </tr>
                        <tr>
                            <td><strong>Phase 3: SEO & Content</strong></td>
                            <td>Semantic on-page SEO foundation, structured metadata, asset compression.</td>
                        </tr>
                        <tr>
                            <td><strong>Phase 4: QA & Launch</strong></td>
                            <td>Cross-browser testing, mobile responsiveness audit, SSL setup & live handover.</td>
                        </tr>
                    `, "Phase / Package", "Deliverables & Outcomes")}

                    <h2>3. Timeline & Delivery</h2>
                    <p>The estimated project execution timeline is <strong>${data.deadline}</strong>, structured in agile sprints with scheduled progress reviews.</p>

                    <h2>4. Investment & Commercial Terms</h2>
                    <p>The total net investment for the deliverables outlined above is <strong>${data.budget}</strong> (plus applicable VAT/taxes).</p>
                    <ul>
                        <li><strong>50% Initial Deposit</strong> upon signing and kickoff</li>
                        <li><strong>50% Final Settlement</strong> upon QA completion and official go-live</li>
                    </ul>

                    <h2>5. Next Steps</h2>
                    <p>To approve this proposal, simply complete the digital signature verification via our online client portal. We will immediately schedule our initial kickoff sprint.</p>
                    
                    <p class="mt-6">We look forward to a highly successful partnership!</p>
                    <p class="mt-4 font-semibold">${data.agencyName}</p>
                `;

            case 'fr':
                return `
                    <p>Chère équipe de <strong>${data.clientName}</strong>,</p>
                    <p>Merci pour nos échanges et votre confiance envers <strong>${data.agencyName}</strong>. Nous avons préparé cette proposition commerciale pour votre projet <em>${data.category}</em>.</p>
                    <h2>1. Objectifs du Projet</h2>
                    <blockquote>
                        <strong>Objectifs principaux :</strong>
                        <ul class="mt-2 space-y-1">${data.bulletList || '<li>Relaunch et optimisation digitale</li>'}</ul>
                    </blockquote>
                    <h2>2. Périmètre d'Intervention</h2>
                    ${buildDeliverablesTable(`
                        <tr><td><strong>Phase 1: Strategie</strong></td><td>Planification UI/UX et concept responsive.</td></tr>
                        <tr><td><strong>Phase 2: Developpement</strong></td><td>Codage clean, optimisation et SEO.</td></tr>
                    `, "Phase / Module", "Détails des prestations")}
                    <h2>3. Calendrier</h2>
                    <p>Délai prévisionnel : <strong>${data.deadline}</strong>.</p>
                    <h2>4. Investissement</h2>
                    <p>Budget total : <strong>${data.budget}</strong> (HT).</p>
                    <p class="mt-4 font-semibold">${data.agencyName}</p>
                `;

            case 'es':
                return `
                    <p>Estimado equipo de <strong>${data.clientName}</strong>,</p>
                    <p>Muchas gracias por la reunión y su confianza en <strong>${data.agencyName}</strong>. Presentamos la propuesta para el proyecto <em>${data.category}</em>.</p>
                    <h2>1. Objetivos del Proyecto</h2>
                    <blockquote>
                        <strong>Metas del Proyecto:</strong>
                        <ul class="mt-2 space-y-1">${data.bulletList || '<li>Desarrollo y diseño profesional</li>'}</ul>
                    </blockquote>
                    <h2>2. Alcance del Trabajo</h2>
                    ${buildDeliverablesTable(`
                        <tr><td><strong>Fase 1: Diseño</strong></td><td>Estructura UX/UI y responsive mockups.</td></tr>
                        <tr><td><strong>Fase 2: Programacion</strong></td><td>Desarrollo limpio y SEO on-page.</td></tr>
                    `, "Fase", "Descripción")}
                    <h2>3. Cronograma</h2>
                    <p>Plazo estimado : <strong>${data.deadline}</strong>.</p>
                    <h2>4. Inversión</h2>
                    <p>Presupuesto : <strong>${data.budget}</strong> (Neto).</p>
                    <p class="mt-4 font-semibold">${data.agencyName}</p>
                `;

            case 'de':
            default:
                return `
                    <p>Sehr geehrte Damen und Herren,<br>sehr geehrtes Team von <strong>${data.clientName}</strong>,</p>
                    <p>vielen Dank für das angenehme Vorgespräch und Ihr Vertrauen in <strong>${data.agencyName}</strong>. Basierend auf Ihren individuellen Anforderungen haben wir folgendes maßgeschneidertes B2B-Umsetzungskonzept für Sie erarbeitet.</p>
                    
                    <h2>1. Ausgangslage & Zielsetzung</h2>
                    <p>Ziel dieses Projekts im Bereich <em>${data.category}</em> ist es, eine moderne, performante und conversion-starke digitale Lösung zu realisieren, die messbare Resultate liefert.</p>
                    
                    <blockquote>
                        <strong>Definierte Kernziele & Anforderungen:</strong>
                        <ul class="mt-2 space-y-1">
                            ${data.bulletList || '<li>Optimierung des digitalen Markenauftritts</li><li>Gewinnung qualifizierter Leads und Neukunden</li>'}
                        </ul>
                    </blockquote>

                    <h2>2. Leistungsumfang & Deliverables</h2>
                    <p>Unser Leistungspaket umfasst alle essenziellen Phasen und Deliverables bis zum erfolgreichen Go-Live:</p>
                    ${buildDeliverablesTable(`
                        <tr>
                            <td><strong>Phase 1: Strategie & UI/UX</strong></td>
                            <td>Struktur- & Wireframe-Konzept, zielgruppenoptimiertes UI/UX-Design, Design-System.</td>
                        </tr>
                        <tr>
                            <td><strong>Phase 2: Technische Umsetzung</strong></td>
                            <td>Moderne, responsive Entwicklung, saubere Code-Basis, CMS-Integration & Ladezeiten-Optimierung.</td>
                        </tr>
                        <tr>
                            <td><strong>Phase 3: SEO & Content</strong></td>
                            <td>On-Page SEO-Grundstruktur, semantische Überschriften, Meta-Tags & Bildkompression.</td>
                        </tr>
                        <tr>
                            <td><strong>Phase 4: QA, Launch & Übergabe</strong></td>
                            <td>Cross-Browser-Testing, Mobile Responsiveness Check, SSL & persönliche Übergabe.</td>
                        </tr>
                    `, "Phase / Arbeitspaket", "Leistungsbestandteile & Ergebnisse")}

                    <h2>3. Timeline & Meilensteine</h2>
                    <p>Die geplante Projektlaufzeit beträgt <strong>${data.deadline}</strong>. Die Umsetzung erfolgt in agilen Sprints mit regelmäßigen Feedback-Schleifen.</p>

                    <h2>4. Investition & Zahlungsmodalitäten</h2>
                    <p>Die Gesamtkosten für das beschriebene Leistungspaket belaufen sich auf <strong>${data.budget}</strong> (zzgl. gesetzlicher MwSt.).</p>
                    <ul>
                        <li><strong>50% Anzahlung</strong> bei Projektfreigabe und Start der Konzeptionsphase</li>
                        <li><strong>50% Schlusszahlung</strong> nach finaler Abnahme und erfolgreichem Go-Live</li>
                    </ul>

                    <h2>5. Nächste Schritte</h2>
                    <p>Zur Freigabe dieses Angebots genügt eine kurze Bestätigung über unser digitales Signatur-Portal. Im Anschluss vereinbaren wir den gemeinsamen Kick-off-Termin.</p>
                    
                    <p class="mt-6">Wir freuen uns auf die erfolgreiche Zusammenarbeit!</p>
                    <p class="mt-4 font-semibold">${data.agencyName}</p>
                `;
        }
    }
}

app.post('/api/track-export', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;

        if (db) {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                if (!hasActiveProEntitlement(userData)) {
                    await userRef.update({
                        freeProposalsUsed: admin.firestore.FieldValue.increment(1),
                        lastExportAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`📊 [Quota] Export atomar erhöht für Free-User: ${userId}`);
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Fehler beim Export-Tracking:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// 7. FEATURE 2 & 3: DIGITAL SIGNATURES, MAGIC LINKS, TRACKING & DASHBOARD API
// =============================================================================

/**
 * Helper function to handle saving/publishing a proposal
 */
async function handleSaveProposal(req, res) {
    try {
        const userId = req.user.uid;

        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            const userData = userDoc.exists ? userDoc.data() : null;
            if (!userData || !hasActiveProEntitlement(userData)) {
                return res.status(403).json({
                    error: 'PRO_REQUIRED',
                    message: 'E-Sign und digitale Freigabe-Links sind exklusiv in AgencyOS Pro enthalten.'
                });
            }
        }

        const {
            clientName,
            clientEmail = '',
            category = 'Projekt-Dokument',
            budget = 'Nach Vereinbarung',
            deadline = 'ca. 4-6 Wochen',
            agencyName = 'Agentur',
            agencyEmail = '',
            proposalHTML,
            logoUrl = '',
            language = 'de',
            tone = 'professional',
            theme = 'modern-minimal',
            roiCalculator = null,
            autoFollowUp = true,
            documentType = 'proposal'
        } = req.body;

        if (!clientName || !proposalHTML) {
            return res.status(400).json({ error: 'Kundenname und Dokumenteninhalt sind erforderlich.' });
        }

        const proposalId = 'prop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const securityToken = crypto.randomBytes(24).toString('hex');
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const shareUrl = `${baseUrl}/view.html?id=${proposalId}&token=${securityToken}`;
        const nowIso = new Date().toISOString();

        // Sanitize ROI Calculator object if enabled
        let cleanRoiCalculator = null;
        if (roiCalculator && roiCalculator.enabled) {
            cleanRoiCalculator = {
                enabled: true,
                title: escapeHtml(roiCalculator.title || 'Geschätzter Mehrumsatz & ROI-Rechner'),
                description: escapeHtml(roiCalculator.description || 'Passe den Schieberegler an:'),
                sliderLabel: escapeHtml(roiCalculator.sliderLabel || 'Zusätzliche Kunden / Monat'),
                min: Number(roiCalculator.min) || 1,
                max: Number(roiCalculator.max) || 50,
                step: Number(roiCalculator.step) || 1,
                defaultValue: Number(roiCalculator.defaultValue) || 10,
                unit: escapeHtml(roiCalculator.unit || 'Kunden'),
                baseValue: Number(roiCalculator.baseValue) || 500,
                multiplier: Number(roiCalculator.multiplier) || 12,
                resultLabel: escapeHtml(roiCalculator.resultLabel || 'Geschätzter jährlicher Mehrertrag'),
                resultPrefix: escapeHtml(roiCalculator.resultPrefix || 'ca. '),
                resultSuffix: escapeHtml(roiCalculator.resultSuffix || ' € / Jahr')
            };
        }

        const proposalData = {
            id: proposalId,
            proposalId,
            userId,
            language,
            tone,
            documentType: escapeHtml(documentType || 'proposal'),
            theme: escapeHtml(theme || 'modern-minimal'),
            clientName: escapeHtml(clientName),
            clientEmail: clientEmail || '',
            category: escapeHtml(category || 'Projekt-Dokument'),
            budget: escapeHtml(budget || 'Nach Vereinbarung'),
            deadline: escapeHtml(deadline || 'ca. 4-6 Wochen'),
            agencyName: escapeHtml(agencyName || 'Agentur'),
            agencyEmail: agencyEmail || '',
            logoUrl: logoUrl || '',
            proposalHTML: proposalHTML,
            roiCalculator: cleanRoiCalculator,
            autoFollowUp: autoFollowUp !== false,
            followUpSentAt: null,
            followUpCount: 0,
            status: 'pending',
            securityToken,
            shareUrl,
            viewCount: 0,
            totalDurationSeconds: 0,
            openedAt: null,
            firstViewedAt: null,
            lastOpenedAt: null,
            lastViewedAt: null,
            lastPingAt: null,
            createdAt: nowIso
        };

        if (db) {
            await db.collection('proposals').doc(proposalId).set({
                ...proposalData,
                serverCreatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            memoryProposals.set(proposalId, proposalData);
        }

        console.log(`📝 [Digital Proposal / Magic Link] Angebot gespeichert: ${proposalId} für Kunde: ${clientName} (Status: pending)`);

        // Outbound Webhook Event: proposal.created
        dispatchOutboundWebhook(userId, 'proposal.created', {
            proposalId: proposalId,
            language: language,
            tone: tone,
            theme: theme,
            shareUrl: shareUrl,
            clientName: proposalData.clientName,
            clientEmail: proposalData.clientEmail,
            category: proposalData.category,
            budget: proposalData.budget,
            deadline: proposalData.deadline,
            status: 'pending',
            createdAt: proposalData.createdAt
        });

        res.json({
            success: true,
            proposalId,
            shareUrl,
            securityToken,
            status: 'pending'
        });

    } catch (error) {
        console.error('❌ Fehler beim Speichern des Angebots:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * 2. Digital Signatures & "Magic Links": /api/proposals/save & /api/proposals/publish
 */
app.post('/api/proposals/save', verifyFirebaseAuth, requireAuth, handleSaveProposal);
app.post('/api/proposals/publish', verifyFirebaseAuth, requireAuth, handleSaveProposal);

/**
 * 3. Proposal Tracking (Dashboard): /api/proposals - Alle Angebote des eingeloggten Nutzers abrufen
 */
app.get('/api/proposals', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        let proposals = [];

        if (db) {
            try {
                const snapshot = await db.collection('proposals')
                    .where('userId', '==', userId)
                    .get();

                snapshot.forEach(doc => {
                    const data = doc.data();
                    proposals.push({
                        id: doc.id,
                        proposalId: data.proposalId || doc.id,
                        clientName: data.clientName || 'Unbenannt',
                        category: data.category || 'Projektangebot',
                        budget: data.budget || '-',
                        deadline: data.deadline || '-',
                        language: data.language || 'de',
                        tone: data.tone || 'professional',
                        theme: data.theme || 'modern-minimal',
                        status: data.status || 'pending',
                        viewCount: data.viewCount || 0,
                        totalDurationSeconds: data.totalDurationSeconds || 0,
                        openedAt: data.openedAt || data.firstViewedAt || null,
                        lastOpenedAt: data.lastOpenedAt || data.lastViewedAt || null,
                        signedAt: data.signature ? data.signature.signedAt : (data.signedAt || null),
                        createdAt: data.createdAt || null,
                        shareUrl: data.shareUrl || `/view.html?id=${data.proposalId || doc.id}&token=${data.securityToken || ''}`,
                        securityToken: data.securityToken || ''
                    });
                });

                // Sort descending by createdAt
                proposals.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            } catch (fsErr) {
                console.warn('⚠️ [Firestore Fetch Proposals Fallback]:', fsErr.message);
                memoryProposals.forEach(p => {
                    if (p.userId === userId) proposals.push(p);
                });
                proposals.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            }
        } else {
            memoryProposals.forEach(p => {
                if (p.userId === userId) proposals.push(p);
            });
            proposals.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }

        res.json({
            success: true,
            count: proposals.length,
            proposals
        });

    } catch (error) {
        console.error('❌ Fehler beim Abrufen der Angebote:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 2. Proposal für Kunden / Magic Link abrufen: GET /api/proposals/:id
 */
app.get('/api/proposals/:id', async (req, res) => {
    try {
        const proposalId = req.params.id;
        const token = req.query.token;

        let proposal = null;

        if (db) {
            const doc = await db.collection('proposals').doc(proposalId).get();
            if (doc.exists) {
                proposal = doc.data();
            }
        } else {
            proposal = memoryProposals.get(proposalId);
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Angebot nicht gefunden.' });
        }

        // Wenn ein Token im Dokument hinterlegt ist, validieren
        if (proposal.securityToken && proposal.securityToken !== token) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Ungültiger oder abgelaufener Freigabe-Link.' });
        }

        // Resolve agency branding for white-labeling
        let branding = req.customBranding || null;
        if (!branding && proposal.userId && db) {
            try {
                const userDoc = await db.collection('users').doc(proposal.userId).get();
                if (userDoc.exists && hasActiveProEntitlement(userDoc.data())) {
                    const u = userDoc.data();
                    branding = {
                        userId: proposal.userId,
                        agencyName: u.agencyName || proposal.agencyName || 'Agentur',
                        brandLogoUrl: u.brandLogoUrl || proposal.logoUrl || '',
                        brandPrimaryColor: u.brandPrimaryColor || '#2563eb',
                        hideBranding: u.hideBranding !== false,
                        customDomain: u.customDomain || ''
                    };
                }
            } catch (e) {
                console.warn('Branding fetch error:', e.message);
            }
        }

        res.json({
            success: true,
            proposal,
            branding: branding || {
                agencyName: 'AgencyOS',
                brandLogoUrl: proposal.logoUrl || '',
                brandPrimaryColor: '#2563eb',
                hideBranding: false,
                customDomain: ''
            }
        });

    } catch (error) {
        console.error('❌ Fehler beim Laden des E-Sign Angebots:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 3. Angebot Duplizieren / Versionieren (Klon-Funktion): POST /api/proposals/:id/duplicate
 */
app.post('/api/proposals/:id/duplicate', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        const sourceId = req.params.id;

        let sourceProposal = null;

        if (db) {
            const doc = await db.collection('proposals').doc(sourceId).get();
            if (doc.exists) sourceProposal = doc.data();
        } else {
            sourceProposal = memoryProposals.get(sourceId);
        }

        if (!sourceProposal) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Quellangebot nicht gefunden.' });
        }

        if (sourceProposal.userId !== userId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Du hast keine Berechtigung, dieses Angebot zu duplizieren.' });
        }

        const newProposalId = 'prop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const securityToken = crypto.randomBytes(24).toString('hex');
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const shareUrl = `${baseUrl}/view.html?id=${newProposalId}&token=${securityToken}`;
        const nowIso = new Date().toISOString();

        const duplicatedData = {
            ...sourceProposal,
            id: newProposalId,
            proposalId: newProposalId,
            clientName: `${sourceProposal.clientName} (Kopie)`,
            status: 'pending',
            signature: null,
            signedAt: null,
            viewCount: 0,
            totalDurationSeconds: 0,
            openedAt: null,
            firstViewedAt: null,
            lastOpenedAt: null,
            lastViewedAt: null,
            lastPingAt: null,
            followUpSentAt: null,
            followUpCount: 0,
            securityToken,
            shareUrl,
            createdAt: nowIso
        };

        if (db) {
            await db.collection('proposals').doc(newProposalId).set({
                ...duplicatedData,
                serverCreatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            memoryProposals.set(newProposalId, duplicatedData);
        }

        console.log(`📋 [Proposal Duplicated] Angebot ${sourceId} geklont als ${newProposalId} für User ${userId}`);

        res.json({
            success: true,
            message: 'Angebot erfolgreich geklont!',
            proposalId: newProposalId,
            shareUrl,
            proposal: duplicatedData
        });

    } catch (error) {
        console.error('❌ Fehler beim Duplizieren des Angebots:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 4. Einzelnes Angebot löschen: DELETE /api/proposals/:id
 */
app.delete('/api/proposals/:id', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        const proposalId = req.params.id;

        let proposal = null;

        if (db) {
            const docRef = db.collection('proposals').doc(proposalId);
            const doc = await docRef.get();
            if (doc.exists) {
                proposal = doc.data();
                if (proposal.userId === userId) {
                    await docRef.delete();
                }
            }
        } else {
            proposal = memoryProposals.get(proposalId);
            if (proposal && proposal.userId === userId) {
                memoryProposals.delete(proposalId);
            }
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Angebot nicht gefunden.' });
        }

        if (proposal.userId !== userId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Keine Berechtigung zum Löschen dieses Angebots.' });
        }

        console.log(`🗑️ [Proposal Deleted] Angebot ${proposalId} von User ${userId} gelöscht.`);

        res.json({
            success: true,
            message: 'Angebot erfolgreich gelöscht.',
            proposalId
        });

    } catch (error) {
        console.error('❌ Fehler beim Löschen des Angebots:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// 🎯 FEATURE 3: KI-DEAL-SCORING & ANGEBOTS-OPTIMIERER
// =============================================================================
const dealScoreHandler = async (req, res) => {
    try {
        const {
            clientName = 'Kunde',
            category = 'Projektangebot',
            budget = '1.000 - 5.000 €',
            deadline = 'ca. 4 Wochen',
            agencyName = 'Agentur',
            proposalHTML = '',
            proposalText = '',
            language = 'de'
        } = req.body;

        const cleanText = (proposalText || proposalHTML.replace(/<[^>]*>?/gm, ' ')).substring(0, 5000);

        let result = null;

        if (geminiAI) {
            try {
                const model = geminiAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                const prompt = `Du bist ein weltklasse B2B-Sales Director, Deal-Closer und Verkaufspsychologie-Experte.
Analysiere das folgende Geschäftsangebot und bewerte die Abschlusswahrscheinlichkeit (Win-Probability Score 0-100%).

ANGABEN ZUM ANGEBOT:
- Kunde: ${clientName}
- Projekt/Kategorie: ${category}
- Budget: ${budget}
- Timeline: ${deadline}
- Agentur: ${agencyName}
- Sprache: ${language}
- Angebotstext (Auszug):
"""
${cleanText}
"""

AUFGABE:
Analysiere das Angebot auf:
1. Nutzenargumentation & Klarheit (Value Proposition)
2. Preis-/Leistungsverhältnis & wahrgenommener ROI
3. Risikoreduktion & Vertrauensaufbau (Garantien, Meilensteine, Audit)
4. Call-to-Action & Verbindlichkeit

Gib deine Antwort AUSSCHLIESSLICH als valides JSON in folgendem Format zurück (kein Markdown, keine Backticks):
{
  "score": 84,
  "winProbability": "Sehr Hoch",
  "verdictHeadline": "Ausgezeichnete Abschlusschancen durch klare Mehrwert-Kommunikation",
  "verdictSummary": "Das Angebot überzeugt durch eine transparente Gliederung und überzeugenden ROI.",
  "metrics": {
    "valueClarity": 88,
    "pricingPower": 80,
    "riskReduction": 85,
    "ctaStrength": 82
  },
  "strengths": [
    "Präziser Nutzen für den Kunden klar im Vordergrund.",
    "Strukturierte Meilensteinplanung minimiert Kundenrisiko."
  ],
  "weaknesses": [
    "Fehlende explizite Zahlungsmodalitäten oder Anzahlungsregelung.",
    "Wenig Dringlichkeit oder Kapazitätsverknappung."
  ],
  "recommendations": [
    "Füge ein klares 'Next Steps'-Kapitel mit verbindlicher Gültigkeitsfrist (z.B. 14 Tage) hinzu.",
    "Betone den geschätzten ROI oder die Amortisationsdauer noch deutlicher.",
    "Ergänze ein kurzes Kunden-Testimonial oder Fallbeispiel zur Steigerung der Abschlussrate."
  ],
  "estimatedClosingDays": 7
}`;

                const response = await model.generateContent(prompt);
                const text = response.response.text();
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                }
            } catch (aiErr) {
                console.warn('⚠️ [AI Deal Scoring] Gemini API Fehler, nutze intelligente Heuristik:', aiErr.message);
            }
        }

        // Intelligenter Heuristik-Fallback falls AI offline oder Rate-Limit
        if (!result) {
            let score = 74;
            const textLen = cleanText.length;
            if (textLen > 400) score += 8;
            if (budget && budget !== '-' && budget !== 'Nach Vereinbarung') score += 6;
            if (cleanText.includes('€') || cleanText.includes('EUR') || cleanText.includes('$')) score += 4;
            if (cleanText.toLowerCase().includes('garantie') || cleanText.toLowerCase().includes('support') || cleanText.toLowerCase().includes('meilenstein')) score += 4;
            if (score > 96) score = 96;

            result = {
                score: score,
                winProbabilityScore: score,
                winProbability: score >= 85 ? 'Sehr Hoch' : (score >= 70 ? 'Hoch' : 'Mittel'),
                verdictHeadline: score >= 80 ? 'Ausgezeichnete Abschlusschancen' : 'Solides Angebot mit Optimierungspotenzial',
                verdictSummary: `Solides Angebot mit ${score}% prognostizierter Abschlusschance für ${clientName}. Gute Argumentationsbasis.`,
                metrics: {
                    valueClarity: Math.min(100, score + 4),
                    pricingPower: Math.max(50, score - 6),
                    riskReduction: Math.min(100, score + 2),
                    ctaStrength: Math.max(50, score - 4)
                },
                strengths: [
                    'Strukturierte Phasen und transparente Projektdefinition.',
                    'Klare Benennung von Verantwortlichkeiten und Liefergegenständen.'
                ],
                weaknesses: [
                    'Dringlichkeitsfaktor könnte durch befristete Konditionen verstärkt werden.',
                    'Verkaufspsychologischer ROI ist noch nicht maximal hervorgehoben.'
                ],
                recommendations: [
                    'Ergänze den interaktiven ROI-Kalkulator, damit der Kunde seinen Mehrumsatz live sieht.',
                    'Setze eine feste Gültigkeit von 14 Tagen, um Entscheidungsdruck zu erzeugen.',
                    'Aktiviere das 48h Auto-Follow-Up, um 38% mehr Abschlüsse zu erzielen.'
                ],
                estimatedClosingDays: score > 80 ? 5 : 8
            };
        }

        const finalScore = result.score || result.winProbabilityScore || 85;
        const winProb = result.winProbability || (finalScore >= 85 ? 'Sehr Hoch' : (finalScore >= 70 ? 'Hoch' : (finalScore >= 50 ? 'Mittel' : 'Kritisch')));
        const verdictHeadline = result.verdictHeadline || (finalScore >= 80 ? 'Ausgezeichnete Abschlusschancen' : 'Solides Angebot mit Optimierungspotenzial');
        const verdictSummary = result.verdictSummary || result.summary || 'Das Angebot überzeugt durch eine transparente Gliederung.';
        const metrics = result.metrics || result.categoryScores || { valueClarity: 85, pricingPower: 80, riskReduction: 75, ctaStrength: 85 };
        const strengths = result.strengths || [];
        const weaknesses = result.weaknesses || [];
        const recommendations = result.recommendations || result.suggestions || [];

        res.json({
            success: true,
            score: finalScore,
            winProbabilityScore: finalScore,
            winProbability: winProb,
            verdictHeadline: verdictHeadline,
            verdictSummary: verdictSummary,
            summary: verdictSummary,
            metrics: {
                valueClarity: metrics.valueClarity || 85,
                pricingPower: metrics.pricingPower || 80,
                riskReduction: metrics.riskReduction || 75,
                ctaStrength: metrics.ctaStrength || metrics.callToAction || 85
            },
            categoryScores: metrics,
            strengths: strengths,
            weaknesses: weaknesses,
            recommendations: recommendations,
            suggestions: recommendations,
            scoring: result
        });

    } catch (error) {
        console.error('❌ Fehler beim Deal-Scoring:', error);
        res.status(500).json({ error: error.message });
    }
};

app.post('/api/score-proposal', verifyFirebaseAuth, requireAuth, requirePro, dealScoreHandler);
app.post('/api/proposals/deal-score', verifyFirebaseAuth, requireAuth, requirePro, dealScoreHandler);

// =============================================================================
// 🌐 FEATURE 1: CUSTOM DOMAINS & WHITE-LABELING (AGENTUR-MODUS)
// =============================================================================
app.post('/api/user/custom-domain', verifyFirebaseAuth, requireAuth, requirePro, async (req, res) => {
    try {
        const userId = req.user.uid;
        let { customDomain, brandPrimaryColor, brandColor, brandLogoUrl, hideBranding } = req.body;
        brandPrimaryColor = brandPrimaryColor || brandColor || '#2563eb';
        if (!/^#[0-9a-f]{6}$/i.test(String(brandPrimaryColor))) {
            return res.status(400).json({ error: 'INVALID_BRAND_COLOR' });
        }

        if (customDomain) {
            customDomain = customDomain.trim().toLowerCase()
                .replace(/^https?:\/\//, '')
                .replace(/\/.*$/, '');
            
            const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
            if (!domainRegex.test(customDomain)) {
                return res.status(400).json({
                    error: 'INVALID_DOMAIN',
                    message: 'Bitte gib eine gültige Domain oder Subdomain ein (z.B. angebote.agentur.de).'
                });
            }

            if (db) {
                const checkSnapshot = await db.collection('users')
                    .where('customDomain', '==', customDomain)
                    .get();
                
                const isTaken = checkSnapshot.docs.some(doc => doc.id !== userId);
                if (isTaken) {
                    return res.status(400).json({
                        error: 'DOMAIN_ALREADY_TAKEN',
                        message: 'Diese Custom Domain ist bereits von einem anderen Account registriert.'
                    });
                }
            }
        } else {
            customDomain = '';
        }

        const updateData = {
            customDomain: customDomain || '',
            brandPrimaryColor: brandPrimaryColor || '#2563eb',
            brandLogoUrl: brandLogoUrl || '',
            hideBranding: hideBranding !== false,
            customDomainVerified: !!customDomain,
            updatedAt: new Date().toISOString()
        };

        if (db) {
            await db.collection('users').doc(userId).set(updateData, { merge: true });
        }

        if (customDomain) {
            customDomainMap.set(customDomain, {
                userId,
                agencyName: req.user.name || 'Agentur',
                brandLogoUrl: updateData.brandLogoUrl,
                brandPrimaryColor: updateData.brandPrimaryColor,
                hideBranding: updateData.hideBranding,
                customDomain
            });
        }

        res.json({
            success: true,
            message: 'Custom Domain & Branding erfolgreich gespeichert!',
            branding: updateData
        });

    } catch (error) {
        console.error('❌ Fehler beim Speichern der Custom Domain:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user/custom-domain', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        let data = {
            customDomain: '',
            brandPrimaryColor: '#2563eb',
            brandLogoUrl: '',
            hideBranding: false,
            customDomainVerified: false
        };

        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const u = userDoc.data();
                data = {
                    customDomain: u.customDomain || '',
                    brandPrimaryColor: u.brandPrimaryColor || '#2563eb',
                    brandLogoUrl: u.brandLogoUrl || '',
                    hideBranding: u.hideBranding !== false,
                    customDomainVerified: u.customDomainVerified || false,
                    isPro: hasActiveProEntitlement(u)
                };
            }
        }

        res.json({ success: true, settings: data });
    } catch (error) {
        console.error('❌ Fehler beim Abrufen der Custom Domain:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// ACCOUNT MANAGEMENT: WILLKOMMENS-E-MAIL
// =============================================================================
app.post('/api/user/welcome', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        const email = req.user.email;
        let name = req.user.name || 'Nutzer';

        // Versuche, den Namen aus Firestore zu holen, falls nicht im Token
        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const uData = userDoc.data();
                name = uData.displayName || uData.agencyName || name;
            }
        }

        console.log(`📧 [Brevo] Sende Willkommens-E-Mail an: ${email}`);
        const result = await sendWelcomeEmail({ to: email, name });

        if (result.success) {
            res.json({ success: true, message: 'Willkommens-E-Mail erfolgreich gesendet.' });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('❌ Fehler beim Senden der Willkommens-E-Mail:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/branding/resolve', async (req, res) => {
    try {
        const { domain, proposalId } = req.query;
        let branding = null;

        if (domain) {
            const cleanDomain = domain.trim().toLowerCase();
            branding = customDomainMap.get(cleanDomain);

            if (!branding && db) {
                const snap = await db.collection('users')
                    .where('customDomain', '==', cleanDomain)
                    .limit(1)
                    .get();
                if (!snap.empty) {
                    const u = snap.docs[0].data();
                    if (hasActiveProEntitlement(u)) {
                        branding = {
                            userId: snap.docs[0].id,
                            agencyName: u.agencyName || 'Agentur',
                            brandLogoUrl: u.brandLogoUrl || '',
                            brandPrimaryColor: u.brandPrimaryColor || '#2563eb',
                            hideBranding: u.hideBranding !== false,
                            customDomain: cleanDomain
                        };
                        customDomainMap.set(cleanDomain, branding);
                    }
                }
            }
        }

        if (!branding && proposalId) {
            let p = null;
            if (db) {
                const pDoc = await db.collection('proposals').doc(proposalId).get();
                if (pDoc.exists) p = pDoc.data();
            } else {
                p = memoryProposals.get(proposalId);
            }

            if (p && p.userId && db) {
                const uDoc = await db.collection('users').doc(p.userId).get();
                if (uDoc.exists && hasActiveProEntitlement(uDoc.data())) {
                    const u = uDoc.data();
                    branding = {
                        userId: p.userId,
                        agencyName: u.agencyName || p.agencyName || 'Agentur',
                        brandLogoUrl: u.brandLogoUrl || p.logoUrl || '',
                        brandPrimaryColor: u.brandPrimaryColor || '#2563eb',
                        hideBranding: u.hideBranding !== false,
                        customDomain: u.customDomain || ''
                    };
                }
            }
        }

        res.json({
            success: true,
            branding: branding || {
                agencyName: 'AgencyOS',
                brandLogoUrl: '',
                brandPrimaryColor: '#2563eb',
                hideBranding: false,
                customDomain: ''
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// 🤖 FEATURE 4: MANUELLER TEST-TRIGGER FÜR FOLLOW-UP
// =============================================================================
app.post('/api/proposals/:id/trigger-followup', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const proposalId = req.params.id;
        const userId = req.user.uid;

        let proposal = null;
        if (db) {
            const doc = await db.collection('proposals').doc(proposalId).get();
            if (doc.exists) proposal = doc.data();
        } else {
            proposal = memoryProposals.get(proposalId);
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Angebot nicht gefunden.' });
        }

        if (proposal.userId !== userId) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Du hast keine Berechtigung, für dieses Angebot ein Follow-Up auszulösen.' });
        }

        const result = await triggerSingleProposalFollowUp(proposalId, { db, memoryProposals, force: true });
        res.json(result);
    } catch (error) {
        console.error('❌ Fehler beim Auslösen des Follow-Ups:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 3. Proposal Tracking: POST /api/proposals/track/:id & POST /api/proposals/:id/track-open
 */
async function handleTrackProposalOpen(req, res) {
    try {
        const proposalId = req.params.id || req.body.proposalId;
        const { token, device } = req.body;

        if (!proposalId) {
            return res.status(400).json({ error: 'Angebot-ID fehlt.' });
        }

        let proposalRef = null;
        let proposal = null;

        if (db) {
            proposalRef = db.collection('proposals').doc(proposalId);
            const doc = await proposalRef.get();
            if (doc.exists) proposal = doc.data();
        } else {
            proposal = memoryProposals.get(proposalId);
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND' });
        }

        if (proposal.securityToken && proposal.securityToken !== token) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const now = new Date().toISOString();
        const currentCount = (proposal.viewCount || 0) + 1;
        const updateData = {
            viewCount: currentCount,
            openedAt: proposal.openedAt || proposal.firstViewedAt || now,
            firstViewedAt: proposal.firstViewedAt || proposal.openedAt || now,
            lastOpenedAt: now,
            lastViewedAt: now
        };

        if (proposal.status === 'pending' || proposal.status === 'sent') {
            updateData.status = 'viewed';
        }

        if (db && proposalRef) {
            await proposalRef.update({
                ...updateData,
                viewCount: admin.firestore.FieldValue.increment(1)
            });
        } else {
            Object.assign(proposal, updateData);
            memoryProposals.set(proposalId, proposal);
        }

        console.log(`👁️ [Analytics Tracking] Angebot ${proposalId} geöffnet (${currentCount}. Aufruf, Kunde: ${proposal.clientName})`);

        // Outbound Webhook Event bei erstem Aufruf: proposal.viewed
        if (currentCount === 1) {
            dispatchOutboundWebhook(proposal.userId, 'proposal.viewed', {
                proposalId: proposal.proposalId || proposalId,
                clientName: proposal.clientName,
                firstViewedAt: now,
                openedAt: now
            });
        }

        res.json({
            success: true,
            viewCount: currentCount,
            openedAt: updateData.openedAt,
            lastOpenedAt: now
        });
    } catch (error) {
        console.error('❌ Fehler beim Tracking (Open):', error);
        res.status(500).json({ error: error.message });
    }
}

app.post('/api/proposals/track/:id', handleTrackProposalOpen);
app.post('/api/proposals/:id/track-open', handleTrackProposalOpen);

/**
 * Tracking Heartbeat Ping: /api/proposals/:id/ping
 */
app.post('/api/proposals/:id/ping', async (req, res) => {
    try {
        const proposalId = req.params.id;
        const { token, additionalSeconds } = req.body;

        const secondsToAdd = Math.min(Math.max(parseInt(additionalSeconds, 10) || 15, 1), 60);

        let proposalRef = null;
        let proposal = null;

        if (db) {
            proposalRef = db.collection('proposals').doc(proposalId);
            const doc = await proposalRef.get();
            if (doc.exists) proposal = doc.data();
        } else {
            proposal = memoryProposals.get(proposalId);
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND' });
        }

        if (proposal.securityToken && proposal.securityToken !== token) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const now = new Date().toISOString();
        const updatedDuration = (proposal.totalDurationSeconds || 0) + secondsToAdd;

        if (db && proposalRef) {
            await proposalRef.update({
                totalDurationSeconds: admin.firestore.FieldValue.increment(secondsToAdd),
                lastPingAt: now
            });
        } else {
            proposal.totalDurationSeconds = updatedDuration;
            proposal.lastPingAt = now;
            memoryProposals.set(proposalId, proposal);
        }

        res.json({ success: true, totalDurationSeconds: updatedDuration });
    } catch (error) {
        console.error('❌ Fehler beim Tracking (Ping):', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * 4. Webhooks & Digital Signatures: POST /api/proposals/accept & /api/proposals/:id/sign & /api/proposals/:id/accept
 */
async function handleSignAndAcceptProposal(req, res) {
    try {
        const proposalId = req.params.id || req.body.proposalId;
        const { token, signerName, signerRole, signatureDataUrl } = req.body;

        if (!proposalId) {
            return res.status(400).json({ error: 'Angebots-ID ist erforderlich.' });
        }

        if (!signerName) {
            return res.status(400).json({ error: 'Vollständiger Name des Unterzeichners ist erforderlich.' });
        }

        let proposalRef = null;
        let proposal = null;

        if (db) {
            proposalRef = db.collection('proposals').doc(proposalId);
            const doc = await proposalRef.get();
            if (doc.exists) proposal = doc.data();
        } else {
            proposal = memoryProposals.get(proposalId);
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Angebot nicht gefunden.' });
        }

        if (proposal.securityToken && proposal.securityToken !== token) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Ungültiger Freigabe-Link.' });
        }

        if (proposal.status === 'signed') {
            return res.status(400).json({ error: 'ALREADY_SIGNED', message: 'Dieses Angebot wurde bereits unterzeichnet.' });
        }

        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const signedAt = new Date().toISOString();

        const signaturePayload = {
            signerName: escapeHtml(signerName),
            signerRole: escapeHtml(signerRole || ''),
            signedAt,
            ipAddress,
            userAgent: req.headers['user-agent'] || 'Browser Client',
            dataUrl: signatureDataUrl || ''
        };

        if (db && proposalRef) {
            await proposalRef.update({
                status: 'signed',
                signedAt: signedAt,
                signature: signaturePayload,
                serverSignedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            proposal.status = 'signed';
            proposal.signedAt = signedAt;
            proposal.signature = signaturePayload;
            memoryProposals.set(proposalId, proposal);
        }

        console.log(`✍️ [E-Sign & Accept Success] Angebot ${proposalId} rechtswirksam akzeptiert von: ${signerName} (${signerRole || 'Auftraggeber'}) - IP: ${ipAddress}`);

        // 4. Outbound Webhook Dispatch (Zapier, Make, CRM, Slack)
        dispatchOutboundWebhook(proposal.userId, 'proposal.signed', {
            event: 'proposal.accepted',
            proposalId: proposal.proposalId || proposalId,
            status: 'signed',
            clientName: proposal.clientName,
            clientEmail: proposal.clientEmail || '',
            category: proposal.category,
            budget: proposal.budget,
            deadline: proposal.deadline,
            agencyName: proposal.agencyName,
            agencyEmail: proposal.agencyEmail,
            signedAt: signedAt,
            signerName: signaturePayload.signerName,
            signerRole: signaturePayload.signerRole,
            ipAddress: signaturePayload.ipAddress
        });

        // 5. Automatische E-Mail-Bestätigung nach Signatur an Kunde & Agentur senden
        const recipientEmails = [proposal.clientEmail, proposal.agencyEmail].filter(e => e && e.includes('@'));
        for (const targetEmail of recipientEmails) {
            sendProposalSignedConfirmation({
                to: targetEmail,
                recipientName: targetEmail === proposal.clientEmail ? (proposal.clientName || 'Kunde') : (proposal.agencyName || 'Agentur'),
                signerName: signaturePayload.signerName,
                signerRole: signaturePayload.signerRole,
                agencyName: proposal.agencyName || 'Agentur',
                proposalCategory: proposal.category || 'Projektangebot',
                shareUrl: proposal.shareUrl,
                signedAt: signedAt
            }).catch(eErr => console.warn('⚠️ [Sign Notification Email Warning]:', eErr.message));
        }

        res.json({
            success: true,
            status: 'signed',
            signedAt,
            ipAddress,
            message: 'Angebot erfolgreich rechtsverbindlich akzeptiert und signiert.'
        });

    } catch (error) {
        console.error('❌ Fehler beim Signieren und Akzeptieren des Angebots:', error);
        res.status(500).json({ error: error.message });
    }
}

app.post('/api/proposals/accept', handleSignAndAcceptProposal);
app.post('/api/proposals/:id/accept', handleSignAndAcceptProposal);
app.post('/api/proposals/:id/sign', handleSignAndAcceptProposal);

// =============================================================================
// 8. CRM & ZAPIER INTEGRATION API ENDPUNKTE (WEBHOOK CONFIG)
// =============================================================================

/**
 * Webhook-Konfiguration abrufen
 */
app.get('/api/integrations/webhook', verifyFirebaseAuth, requireAuth, requirePro, async (req, res) => {
    try {
        const userId = req.user.uid;
        let webhookData = { webhookUrl: '', webhookEvents: ['proposal.signed'], webhookEnabled: true };

        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const u = userDoc.data();
                webhookData = {
                    webhookUrl: u.webhookUrl || '',
                    webhookEvents: u.webhookEvents || ['proposal.signed'],
                    webhookEnabled: u.webhookEnabled !== false
                };
            }
        } else {
            webhookData = memoryWebhooks.get(userId) || webhookData;
        }

        res.json({ success: true, webhook: webhookData });
    } catch (error) {
        console.error('❌ Fehler beim Laden der Webhook-Konfiguration:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Webhook-Konfiguration speichern
 */
app.post('/api/integrations/webhook', verifyFirebaseAuth, requireAuth, requirePro, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { webhookUrl, webhookEvents = ['proposal.signed'], webhookEnabled = true } = req.body;

        const safeWebhookUrl = webhookUrl ? await validateOutboundUrl(webhookUrl) : '';
        const allowedEvents = new Set(['proposal.signed', 'proposal.viewed', 'proposal.created']);
        const safeEvents = Array.isArray(webhookEvents)
            ? webhookEvents.filter(event => allowedEvents.has(event)).slice(0, 10)
            : ['proposal.signed'];

        if (db) {
            await db.collection('users').doc(userId).set({
                webhookUrl: safeWebhookUrl,
                webhookEvents: safeEvents,
                webhookEnabled: Boolean(webhookEnabled),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } else {
            memoryWebhooks.set(userId, {
                url: safeWebhookUrl,
                events: safeEvents,
                enabled: Boolean(webhookEnabled)
            });
        }

        console.log(`🔗 [CRM Webhook Config] Gespeichert für User ${userId}: ${safeWebhookUrl ? new URL(safeWebhookUrl).host : 'deaktiviert'}`);
        res.json({ success: true, message: 'Webhook-Konfiguration erfolgreich gespeichert.' });

    } catch (error) {
        console.error('❌ Fehler beim Speichern der Webhook-Konfiguration:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Webhook-Test ausführen
 */
app.post('/api/integrations/test', verifyFirebaseAuth, requireAuth, requirePro, async (req, res) => {
    try {
        const { webhookUrl } = req.body;

        const safeWebhookUrl = await validateOutboundUrl(webhookUrl);

        const testPayload = {
            event: 'proposal.test',
            eventId: 'test_' + Date.now(),
            eventTimestamp: new Date().toISOString(),
            data: {
                message: 'Dies ist ein erfolgreicher Test-Event von AgencyOS!',
                proposalId: 'prop_test_12345',
                clientName: 'Musterkunde GmbH & Co. KG',
                budget: '4.900 €',
                deadline: '4 Wochen',
                status: 'signed',
                signedAt: new Date().toISOString(),
                signerName: 'Max Mustermann'
            }
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const testResponse = await fetch(safeWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'AgencyOS-Webhook-Tester/2.0'
            },
            body: JSON.stringify(testPayload),
            signal: controller.signal
        });

        clearTimeout(timeout);
        const responseText = await testResponse.text().catch(() => '');

        res.json({
            success: testResponse.ok,
            status: testResponse.status,
            statusText: testResponse.statusText,
            responseBody: responseText.slice(0, 300)
        });

    } catch (error) {
        console.error('❌ Fehler beim Testen des Webhooks:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Verbindung zum Webhook konnte nicht hergestellt werden.'
        });
    }
});

/**
 * Detailed Analytics: GET /api/proposals/:id/analytics
 */
app.get('/api/proposals/:id/analytics', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const proposalId = req.params.id;
        let proposal = null;

        if (db) {
            const doc = await db.collection('proposals').doc(proposalId).get();
            if (doc.exists) proposal = doc.data();
        } else {
            proposal = memoryProposals.get(proposalId);
        }

        if (!proposal) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Angebot nicht gefunden.' });
        }

        if (proposal.userId !== req.user.uid) {
            return res.status(403).json({ error: 'FORBIDDEN', message: 'Kein Zugriff auf dieses Angebot.' });
        }

        const isCurrentlyViewing = proposal.lastPingAt
            ? (Date.now() - new Date(proposal.lastPingAt).getTime()) < 45000
            : false;

        res.json({
            success: true,
            analytics: {
                proposalId: proposal.proposalId,
                clientName: proposal.clientName,
                language: proposal.language || 'de',
                tone: proposal.tone || 'professional',
                status: proposal.status,
                viewCount: proposal.viewCount || 0,
                totalDurationSeconds: proposal.totalDurationSeconds || 0,
                openedAt: proposal.openedAt || proposal.firstViewedAt || null,
                firstViewedAt: proposal.firstViewedAt || proposal.openedAt || null,
                lastOpenedAt: proposal.lastOpenedAt || proposal.lastViewedAt || null,
                lastViewedAt: proposal.lastViewedAt || proposal.lastOpenedAt || null,
                lastPingAt: proposal.lastPingAt,
                isCurrentlyViewing,
                signature: proposal.signature || null
            }
        });
    } catch (error) {
        console.error('❌ Fehler beim Abrufen der Analytics:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// 10. STRIPE CHECKOUT MIT PURCHASING POWER PARITY (PPP) & DOUBLE VERIFICATION
// =============================================================================
const handleCreateCheckoutSession = async (req, res) => {
    try {
        const userId = req.user.uid;
        const userEmail = req.user.email || '';
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const billingCycle = req.body.billingCycle || 'monthly';
        if (billingCycle !== 'monthly') {
            return res.status(400).json({ error: 'Für AgencyOS Pro ist derzeit nur das monatliche Abo verfügbar.' });
        }

        // Verified PPP Pricing from Middleware (Zero-Trust Source of Truth)
        const ppp = req.pppVerification || {
            tierId: 'TIER_1',
            tierName: 'High (Default)',
            stripePriceId: process.env.AGENCY_OS_PRICE_EUR_MONTHLY,
            detectedIpCountry: 'DE',
            clientTimezone: 'Europe/Berlin',
            isSpoofed: false
        };

        const targetPriceId = priceForCountry(ppp.detectedIpCountry);
        if (!targetPriceId || !configuredAgencyPriceIds().has(targetPriceId)) {
            return res.status(503).json({ error: 'AGENCYOS_PRICING_NOT_CONFIGURED' });
        }

        const sessionPayload = {
            mode: 'subscription',
            line_items: [
                {
                    price: targetPriceId,
                    quantity: 1,
                },
            ],
            client_reference_id: userId,
            metadata: {
                userId: userId,
                userEmail: userEmail,
                pppTier: ppp.tierId,
                ipCountry: ppp.detectedIpCountry,
                clientTimezone: ppp.clientTimezone,
                isSpoofed: String(ppp.isSpoofed),
                billingCycle: billingCycle,
                app: 'agencyos',
                product: 'agencyos_pro'
            },
            success_url: `${baseUrl}/index.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/index.html?payment=canceled`,
        };

        if (userEmail) {
            sessionPayload.customer_email = userEmail;
        }

        console.log(`💳 [Stripe Checkout] Erstelle Session für User: ${userId} | PPP: ${ppp.tierId} (${targetPriceId}) | Cycle: ${billingCycle} | Land: ${ppp.detectedIpCountry}`);

        const session = await stripe.checkout.sessions.create(sessionPayload);
        res.json({
            url: session.url,
            sessionId: session.id,
            pppTier: ppp.tierId,
            currency: session.currency || 'eur'
        });
    } catch (error) {
        console.error('❌ Fehler beim Erstellen der Stripe Checkout Session:', error);
        res.status(500).json({ error: error.message });
    }
};

app.post('/api/create-checkout-session', verifyFirebaseAuth, requireAuth, doubleVerificationMiddleware, handleCreateCheckoutSession);
app.post('/create-checkout-session', verifyFirebaseAuth, requireAuth, doubleVerificationMiddleware, handleCreateCheckoutSession);

// =============================================================================
// 11. STRIPE CUSTOMER PORTAL (SELF-SERVICE BILLING & RECHNUNGEN)
// =============================================================================
/**
 * Erstellt eine abgesicherte Stripe Billing Portal Session URL.
 * Ermöglicht Kunden: Rechnungen herunterladen, Zahlungsmethode ändern, Abo kündigen.
 */
app.post('/api/create-customer-portal-session', verifyFirebaseAuth, requireAuth, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userEmail = req.user.email;
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

        console.log(`💳 [Stripe Portal] Generiere Billing Portal Session für User: ${userId} (${userEmail})`);

        let stripeCustomerId = null;

        // 1. Suche Stripe Customer ID in Firestore
        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                stripeCustomerId = userDoc.data().stripeCustomerId;
            }
        }

        // 2. Fallback: Suche Kunden via E-Mail bei Stripe
        if (!stripeCustomerId && userEmail) {
            const existingCustomers = await stripe.customers.list({
                email: userEmail,
                limit: 1
            });

            if (existingCustomers.data.length > 0) {
                stripeCustomerId = existingCustomers.data[0].id;
                if (db) {
                    await db.collection('users').doc(userId).set({ stripeCustomerId }, { merge: true });
                }
            }
        }

        // 3. Wenn immer noch kein Stripe Customer existiert: Erstelle einen neuen
        if (!stripeCustomerId) {
            const newCustomer = await stripe.customers.create({
                email: userEmail,
                metadata: {
                    userId: userId,
                    app: 'AgencyOS'
                }
            });
            stripeCustomerId = newCustomer.id;
            if (db) {
                await db.collection('users').doc(userId).set({ stripeCustomerId }, { merge: true });
            }
        }

        // 4. Erstelle die Billing Portal Session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${baseUrl}/index.html?portal=returned`
        });

        console.log(`✅ [Stripe Portal] Session erfolgreich generiert: ${portalSession.url}`);

        res.json({
            success: true,
            url: portalSession.url
        });
    } catch (error) {
        console.error('❌ Fehler beim Erstellen der Customer Portal Session:', error);
        res.status(500).json({
            error: 'PORTAL_SESSION_FAILED',
            message: error.message || 'Konnte Kundenportal-Sitzung nicht initialisieren.'
        });
    }
});

// =============================================================================
// 12. DSGVO-KONFORME ACCOUNT-LÖSCHUNG (ZERO-GHOST-BILLING ARCHITEKTUR)
// =============================================================================
/**
 * Vollständige, DSGVO-konforme Löschung des Accounts:
 * 1. Sofortiges Stornieren aller aktiven Stripe-Subscriptions (Zero-Ghost-Billing Garantie)
 * 2. Bereinigen aller erstellten Angebote & Analytics
 * 3. Restlose Löschung des Nutzerprofils in Firestore
 * 4. Löschung des Nutzers aus Firebase Authentication
 * 5. Versand einer formalen Bestätigungs-E-Mail via Brevo
 */
app.post('/api/delete-account', verifyFirebaseAuth, requireAuth, async (req, res) => {
    const userId = req.user.uid;
    const userEmail = req.user.email;
    const userName = req.user.name || req.user.displayName || userEmail?.split('@')[0] || 'Nutzer';

    console.log(`\n🚨 [GDPR Account Deletion] Starte vollständige Account-Löschung für: ${userId} (${userEmail})`);

    const deletionSummary = {
        subscriptionsCancelled: 0,
        proposalsDeleted: 0,
        userDocDeleted: false,
        authDeleted: false,
        emailSent: false
    };

    try {
        // ---------------------------------------------------------------------
        // SCHRITT 1: STRIPE ZERO-GHOST-BILLING (Alle Abonnements sofort stornieren)
        // ---------------------------------------------------------------------
        let stripeCustomerId = null;
        if (db) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                stripeCustomerId = userDoc.data().stripeCustomerId;
            }
        }

        if (!stripeCustomerId && userEmail) {
            const existingCust = await stripe.customers.list({ email: userEmail, limit: 1 });
            if (existingCust.data.length > 0) {
                stripeCustomerId = existingCust.data[0].id;
            }
        }

        if (stripeCustomerId) {
            try {
                // Suche alle aktiven oder pausierten Abonnements
                const subscriptions = await stripe.subscriptions.list({
                    customer: stripeCustomerId,
                    status: 'all'
                });

                for (const sub of subscriptions.data) {
                    if (['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
                        await stripe.subscriptions.cancel(sub.id);
                        deletionSummary.subscriptionsCancelled++;
                        console.log(`🔒 [Stripe] Aktive Subscription ${sub.id} sofort storniert.`);
                    }
                }
            } catch (stripeErr) {
                console.warn('⚠️ [Stripe Deletion] Warnung bei Subscription-Stornierung:', stripeErr.message);
            }
        }

        // ---------------------------------------------------------------------
        // SCHRITT 2: FIRESTORE VORLAGEN & ANGEBOTE LÖSCHEN
        // ---------------------------------------------------------------------
        if (db) {
            try {
                const proposalsSnapshot = await db.collection('proposals').where('userId', '==', userId).get();
                if (!proposalsSnapshot.empty) {
                    const batch = db.batch();
                    proposalsSnapshot.docs.forEach(doc => {
                        batch.delete(doc.ref);
                        deletionSummary.proposalsDeleted++;
                    });
                    await batch.commit();
                    console.log(`🗑️ [Database] ${deletionSummary.proposalsDeleted} gespeicherte Angebote gelöscht.`);
                }
            } catch (propErr) {
                console.warn('⚠️ [Database] Fehler beim Löschen der Angebote:', propErr.message);
            }

            try {
                await db.collection('users').doc(userId).collection('productAccess').doc('agency_os').delete();
            } catch (accessErr) {
                console.warn('⚠️ [Database] Fehler beim Löschen des Produktzugriffs:', accessErr.message);
            }

            // Nutzerdokument in Firestore löschen
            try {
                await db.collection('users').doc(userId).delete();
                deletionSummary.userDocDeleted = true;
                console.log(`🗑️ [Database] Firestore Nutzerdokument users/${userId} restlos entfernt.`);
            } catch (uDocErr) {
                console.warn('⚠️ [Database] Fehler beim Löschen des Nutzerdokuments:', uDocErr.message);
            }
        }

        // Memory Stores bereinigen
        memoryProposals.delete(userId);
        memoryWebhooks.delete(userId);

        // ---------------------------------------------------------------------
        // SCHRITT 3: FIREBASE AUTHENTICATION NUTZER LÖSCHEN
        // ---------------------------------------------------------------------
        if (authAdmin) {
            try {
                await authAdmin.deleteUser(userId);
                deletionSummary.authDeleted = true;
                console.log(`🗑️ [Firebase Auth] Benutzer ${userId} aus Firebase Auth entfernt.`);
            } catch (authErr) {
                console.error('❌ [Firebase Auth] Fehler beim Löschen des Auth-Benutzers:', authErr.message);
            }
        }

        // ---------------------------------------------------------------------
        // SCHRITT 4: BREVO BESTÄTIGUNGS-E-MAIL VERSENDEN
        // ---------------------------------------------------------------------
        if (userEmail) {
            try {
                await sendAccountDeletedEmail({
                    to: userEmail,
                    name: userName
                });
                deletionSummary.emailSent = true;
            } catch (emailErr) {
                console.warn('⚠️ [Brevo] Konnte Lösch-Bestätigungs-E-Mail nicht versenden:', emailErr.message);
            }
        }

        console.log(`✅ [GDPR Account Deletion] Account ${userId} erfolgreich und restlos entfernt:`, deletionSummary);

        res.json({
            success: true,
            message: 'Account, alle aktiven Abonnements und personenbezogene Daten wurden dauerhaft und DSGVO-konform gelöscht.',
            summary: deletionSummary
        });
    } catch (criticalError) {
        console.error('❌ Kritischer Fehler bei der Account-Löschung:', criticalError);
        res.status(500).json({
            error: 'DELETION_FAILED',
            message: 'Fehler bei der Account-Löschung: ' + criticalError.message
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        app: 'AgencyOS Pro',
        features: [
            'Zero-Trust',
            'E-Sign Digital Signatures',
            'CRM & Zapier Webhooks',
            'Real-Time Proposal Tracking',
            'i18n Multi-Language Engine',
            '100% White-Labeling & Custom Domains',
            'Dynamic Interactive ROI Calculators',
            'AI Deal-Scoring & Closer Optimizer',
            'Smart Auto-Follow-Ups (48h Drip Cron Engine)'
        ],
        supportedLanguages: ['de', 'en', 'fr', 'es'],
        firebaseConnected: !!db
    });
});

// =============================================================================
// 🤖 SUPPORT BOT ENDPOINT
// =============================================================================
app.post('/api/support-chat', supportChatLimiter, async (req, res) => {
    try {
        const { message, history } = req.body;
        if (typeof message !== 'string' || !message.trim() || message.length > 2000) {
            return res.status(400).json({ error: 'Message required and limited to 2000 characters' });
        }
        const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
        if (safeHistory.some(item => !item || !['user', 'model', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 1000)) {
            return res.status(400).json({ error: 'Invalid chat history' });
        }

        const deterministicSupportReply = () => {
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes("kündigen") || lowerMsg.includes("abo") || lowerMsg.includes("kündigung")) {
                return "Du kannst dein Abonnement jederzeit über das Stripe-Kundenportal in deinen Account-Einstellungen kündigen. Der Zugang bleibt bis zum Ende des bereits bezahlten Zeitraums aktiv und wird danach automatisch auf Free gestellt.";
            }
            if (lowerMsg.includes("angebot") || lowerMsg.includes("dokument")) {
                return "Erstelle ein Dokument über die Briefing-Felder und starte anschließend die KI-Generierung. Nach der Anmeldung kannst du es speichern, als PDF exportieren und sicher mit deinem Kunden teilen.";
            }
            return "Ich konnte den KI-Support gerade nicht erreichen. Bitte versuche es in wenigen Minuten erneut oder nutze den Support-Kontakt im Footer.";
        };

        if (geminiAI) {
            const model = geminiAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
            });
            // Build simple context from history
            let chatContext = 'Du bist der AgencyOS Support-Bot. Du hilfst Agenturen, unsere SaaS Plattform für Angebote und Rechnungen zu nutzen. Antworte freundlich und präzise.\n\n';
            if (safeHistory.length > 0) {
                safeHistory.forEach(msg => {
                    chatContext += `${msg.role === 'user' ? 'Nutzer' : 'Bot'}: ${msg.content}\n`;
                });
            }
            chatContext += `Nutzer: ${message.trim()}\nBot:`;

            let lastError;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    let timeoutHandle;
                    const response = await Promise.race([
                        model.generateContent(chatContext),
                        new Promise((_, reject) => {
                            timeoutHandle = setTimeout(() => {
                                const timeoutError = new Error('Gemini Support Timeout');
                                timeoutError.status = 503;
                                reject(timeoutError);
                            }, 8000);
                        })
                    ]).finally(() => clearTimeout(timeoutHandle));
                    return res.json({ reply: response.response.text(), provider: 'gemini' });
                } catch (error) {
                    lastError = error;
                    const retryable = [429, 500, 502, 503, 504].includes(Number(error.status));
                    if (!retryable || attempt === 1) break;
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }

            console.warn('⚠️ [Support Bot] Gemini vorübergehend nicht verfügbar:', lastError?.message || 'Unbekannter Fehler');
        }

        res.json({ reply: deterministicSupportReply(), provider: 'fallback' });
    } catch (error) {
        console.error('Support Bot Error:', error);
        res.status(500).json({ error: 'Interner Serverfehler beim Support-Bot.' });
    }
});

// Static HTML pages handle known routes. Unknown routes should stay real 404s so
// crawlers do not mistake the application shell for valid content pages.
app.get('*', (req, res) => {
    res.status(404).type('text/plain').send('Not Found');
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function reconcileExpiredEntitlements() {
    if (!db) return;
    try {
        const snapshot = await db.collection('users').where('isPro', '==', true).get();
        const batch = db.batch();
        let changed = 0;
        for (const doc of snapshot.docs) {
            if (!hasActiveProEntitlement(doc.data())) {
                batch.set(doc.ref, {
                    isPro: false,
                    plan: 'free',
                    subscriptionStatus: doc.data().subscriptionStatus || 'expired',
                    downgradedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                batch.set(doc.ref.collection('productAccess').doc('agency_os'), {
                    product: 'agency_os',
                    plan: 'free',
                    active: false,
                    status: doc.data().subscriptionStatus || 'expired',
                    accessUntil: doc.data().subscriptionAccessUntil || null,
                    stripeSubscriptionId: doc.data().stripeSubscriptionId || null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                changed++;
            }
        }
        if (changed) await batch.commit();
        if (changed) console.log(`🔒 [Entitlement Reconciler] ${changed} abgelaufene Pro-Mitgliedschaften auf Free gesetzt.`);
    } catch (error) {
        console.warn('⚠️ [Entitlement Reconciler] Prüfung fehlgeschlagen:', error.message);
    }
}

app.listen(PORT, () => {
    console.log(`
🚀 =======================================================
   AgencyOS Pro v3 (B2B Multi-Feature SaaS) läuft
   Port: ${PORT} | URL: http://localhost:${PORT}
   Features: Zero-Trust, White-Labeling, ROI-Calc, AI Deal-Score, Auto-Follow-Up
==========================================================
    `);

    // Starte automatische Follow-Up Cron Engine
    try {
        startCronEngine({ db, memoryProposals, checkIntervalMs: 30 * 60 * 1000 });
    } catch (cronErr) {
        console.warn('⚠️ [Cron Engine Startup]:', cronErr.message);
    }

    reconcileExpiredEntitlements();
    setInterval(reconcileExpiredEntitlements, 15 * 60 * 1000).unref();
});
