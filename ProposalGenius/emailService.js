/**
 * AgencyOS - Shared Polymath Transactional E-Mail Service
 * 
 * Verifizierter Absender: noreply@reglerproductions.com
 * Support: support@reglerproductions.com
 * 
 * Features:
 * - Wiederverwendbarer E-Mail-Versand via @getbrevo/brevo Node.js SDK (BrevoClient)
 * - Zahlungs-Fehlschlag Dunning E-Mail mit 1-Click Customer Portal CTA
 * - DSGVO-Account-Löschungs-Bestätigung (Zero-Ghost-Billing)
 */

require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || (process.env.N8N_WEBHOOK_URL ? 'n8n' : 'brevo')).toLowerCase();
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const N8N_WEBHOOK_TOKEN = process.env.N8N_WEBHOOK_TOKEN || '';
const SENDER_EMAIL = process.env.EMAIL_SENDER || 'noreply@reglerproductions.com';
const SENDER_NAME = process.env.EMAIL_SENDER_NAME || 'AgencyOS by Regler Productions';
const SUPPORT_EMAIL = process.env.EMAIL_SUPPORT || 'support@reglerproductions.com';

const isBrevoConfigured = Boolean(BREVO_API_KEY && /^xkeysib-/.test(BREVO_API_KEY));
const isN8nConfigured = EMAIL_PROVIDER === 'n8n'
    && /^https:\/\//.test(N8N_WEBHOOK_URL)
    && Boolean(N8N_WEBHOOK_TOKEN);
const isEmailConfigured = isN8nConfigured || (EMAIL_PROVIDER === 'brevo' && isBrevoConfigured);

if (isEmailConfigured) {
    console.log(`📧 [Email] Shared email transport configured: ${EMAIL_PROVIDER}.`);
} else if (isProduction) {
    console.error(`❌ [Email] Production email transport incomplete for provider: ${EMAIL_PROVIDER}.`);
} else {
    console.log('ℹ️ [Email] Kein produktiver Versand konfiguriert; Entwicklungs-Mock aktiv.');
}

/**
 * Universelle Service-Funktion für den E-Mail-Versand über Brevo
 * 
 * @param {Object} params
 * @param {string} params.to - Empfänger E-Mail-Adresse
 * @param {string} [params.name] - Empfänger Name
 * @param {string} params.subject - Betreffzeile
 * @param {string} params.htmlContent - HTML E-Mail Inhalt
 * @param {string} [params.textContent] - Reiner Text Fallback
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail({ to, name = '', subject, htmlContent, textContent = '' }) {
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
        console.error('❌ [Brevo sendEmail] Keine Empfänger-Adresse angegeben.');
        return { success: false, error: 'Recipient email is required' };
    }

    if (!isEmailConfigured) {
        if (isProduction) {
            return { success: false, error: 'Email transport is not configured' };
        }
        console.log(`\n📨 [Email DEV-MOCK] E-Mail würde versendet an: ${to}`);
        console.log(`📌 Betreff: ${subject}`);
        console.log(`📤 Absender: ${SENDER_NAME} <${SENDER_EMAIL}>`);
        console.log(`📄 Vorschau:\n${textContent || '(HTML Content vorhanden)'}\n`);
        return { success: true, messageId: 'mock-dev-id-' + Date.now() };
    }

    try {
        if (EMAIL_PROVIDER === 'n8n') {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Polymath-Token': N8N_WEBHOOK_TOKEN,
                    'User-Agent': 'AgencyOS-Email-Transport/1.0'
                },
                body: JSON.stringify({
                    to: String(to).trim(),
                    toName: name ? String(name).trim() : null,
                    subject,
                    html: htmlContent,
                    text: textContent,
                    fromEmail: SENDER_EMAIL,
                    fromName: SENDER_NAME,
                    replyTo: SUPPORT_EMAIL,
                    event: null,
                    category: 'transactional',
                    data: null
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);
            const body = await response.text();
            if (!response.ok || /"success"\s*:\s*false|"error"/i.test(body)) {
                throw new Error(`n8n antwortete mit HTTP ${response.status}: ${body.slice(0, 300)}`);
            }
            return { success: true, messageId: `n8n-${Date.now()}` };
        }

        const payload = {
            subject: subject,
            htmlContent: htmlContent,
            sender: {
                name: SENDER_NAME,
                email: SENDER_EMAIL
            },
            to: [
                {
                    email: to.trim(),
                    name: name ? name.trim() : to.split('@')[0]
                }
            ],
            replyTo: {
                name: 'AgencyOS Support',
                email: SUPPORT_EMAIL
            }
        };

        if (textContent) {
            payload.textContent = textContent;
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.message || `HTTP ${response.status}: ${JSON.stringify(data)}`);
        }

        const messageId = data?.messageId || 'SENT';
        console.log(`✅ [Email] E-Mail erfolgreich gesendet an ${to} (MessageId: ${messageId})`);
        return { success: true, messageId };
    } catch (error) {
        const errMsg = error?.message || String(error);
        console.error(`❌ [Email] Fehler beim E-Mail-Versand an ${to}:`, errMsg);
        return {
            success: false,
            error: errMsg
        };
    }
}

/**
 * Dunning E-Mail: Wird getriggert bei fehlgeschlagener Zahlung (invoice.payment_failed)
 * 
 * @param {Object} params
 * @param {string} params.to - E-Mail des Kunden
 * @param {string} [params.name] - Name des Kunden
 * @param {string} [params.portalUrl] - Link zum Stripe Customer Portal
 * @param {string} [params.invoiceUrl] - Stripe Hosted Invoice URL
 */
async function sendPaymentFailedEmail({ to, name = 'Kunde', portalUrl = 'https://agencyos.com', invoiceUrl = '' }) {
    const actionUrl = portalUrl || invoiceUrl || 'https://agencyos.com';
    const subject = '⚠️ Wichtig: Deine Zahlung für AgencyOS Pro ist fehlgeschlagen';

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zahlung fehlgeschlagen - AgencyOS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 24px; border-bottom: 1px solid #1e293b; text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; padding: 10px 18px; border-radius: 12px; font-weight: 800; font-size: 18px; letter-spacing: -0.5px;">
                                Agency<span style="color: #93c5fd;">OS</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Alert Badge -->
                    <tr>
                        <td style="padding: 32px 32px 0;">
                            <div style="background-color: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 16px; text-align: center;">
                                <span style="color: #f87171; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Aktion erforderlich</span>
                                <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 8px 0 0 0;">Deine monatliche Zahlung ist fehlgeschlagen</h2>
                            </div>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 24px 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <p>Hallo <strong>${name}</strong>,</p>
                            <p>wir konnten deine letzte Abonnement-Zahlung für deinen <strong>AgencyOS Pro</strong> Account leider nicht über deine hinterlegte Zahlungsmethode abbuchen.</p>
                            
                            <p style="background-color: #1e293b; border-radius: 8px; padding: 14px 18px; color: #94a3b8; font-size: 13px; margin: 20px 0;">
                                🔒 <strong>Hinweis zur Account-Sicherheit:</strong> Deine Pro-Funktionen (unbegrenzte Angebote, E-Sign, CRM & Tracking) wurden vorübergehend pausiert, um Fehlbuchungen zu vermeiden. Deine bisherigen Angebote bleiben selbstverständlich sicher gespeichert.
                            </p>

                            <p>Bitte aktualisiere deine Zahlungsdaten in deinem Kunden-Portal, um deine Pro-Vorteile sofort wieder ohne Unterbrechung zu nutzen:</p>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${actionUrl}" target="_blank" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);">
                                    💳 Zahlungsdaten jetzt aktualisieren &rarr;
                                </a>
                            </div>

                            <p style="font-size: 13px; color: #64748b;">
                                Falls du Fragen hast oder Hilfe benötigst, antworte einfach direkt auf diese E-Mail oder schreibe uns an <a href="mailto:${SUPPORT_EMAIL}" style="color: #60a5fa; text-decoration: underline;">${SUPPORT_EMAIL}</a>.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
                            <p style="margin: 0 0 6px 0;">&copy; 2026 AgencyOS • Betrieben durch <a href="https://reglerproductions.com" style="color: #94a3b8; text-decoration: underline;">Regler Productions</a></p>
                            <p style="margin: 0;">Kittenfeldstr. 2a, 91795 Dollnstein, Deutschland</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const textContent = `Hallo ${name},\n\ndeine letzte Zahlung für AgencyOS Pro ist leider fehlgeschlagen.\n\nBitte aktualisiere deine Zahlungsdaten im Kunden-Portal:\n${actionUrl}\n\nDein AgencyOS Team\nsupport@reglerproductions.com`;

    return sendEmail({
        to,
        name,
        subject,
        htmlContent,
        textContent
    });
}

/**
 * DSGVO-Account-Löschung: Bestätigungs-E-Mail (Zero-Ghost-Billing)
 * 
 * @param {Object} params
 * @param {string} params.to - E-Mail des gelöschten Accounts
 * @param {string} [params.name] - Name des Nutzers
 */
async function sendAccountDeletedEmail({ to, name = 'Nutzer' }) {
    const subject = 'Bestätigung: Dein AgencyOS Account wurde dauerhaft gelöscht';

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account gelöscht</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 24px; border-bottom: 1px solid #1e293b; text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; padding: 10px 18px; border-radius: 12px; font-weight: 800; font-size: 18px;">
                                Agency<span style="color: #93c5fd;">OS</span>
                            </div>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <h2 style="color: #ffffff; font-size: 20px; margin-top: 0;">Account & Daten erfolgreich gelöscht</h2>
                            <p>Hallo <strong>${name}</strong>,</p>
                            <p>wir bestätigen hiermit die vollständige und DSGVO-konforme Löschung deines <strong>AgencyOS</strong> Accounts (E-Mail: <em>${to}</em>).</p>
                            
                            <div style="background-color: #1e293b; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #94a3b8;">
                                <div style="color: #10b981; font-weight: 700; margin-bottom: 6px;">✓ Zero-Ghost-Billing Garantie:</div>
                                • Alle aktiven Abonnements bei Stripe wurden mit sofortiger Wirkung unwiderruflich storniert.<br>
                                • Es fallen keinerlei zukünftige Zahlungen an.<br>
                                • Deine Firestore-Profildaten und erstellten Angebote wurden restlos aus unserer Datenbank entfernt.<br>
                                • Dein Login bei Firebase Authentication wurde gelöscht.
                            </div>

                            <p>Wir bedanken uns für dein Vertrauen und deine Zeit mit AgencyOS. Solltest du in Zukunft wieder Dokumente erstellen wollen, bist du jederzeit herzlich willkommen.</p>
                            
                            <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
                                Bei Rückfragen erreichst du uns unter <a href="mailto:${SUPPORT_EMAIL}" style="color: #60a5fa;">${SUPPORT_EMAIL}</a>.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
                            &copy; 2026 AgencyOS • Regler Productions • <a href="https://reglerproductions.com" style="color: #94a3b8;">reglerproductions.com</a>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const textContent = `Hallo ${name},\n\ndein AgencyOS Account wurde wie gewünscht dauerhaft gelöscht.\nAlle Stripe-Abonnements wurden storniert (Zero-Ghost-Billing) und deine Daten vollständig entfernt.\n\nDanke für die Zusammenarbeit!\nDein AgencyOS Team`;

    return sendEmail({
        to,
        name,
        subject,
        htmlContent,
        textContent
    });
}

/**
 * Smarte Auto-Follow-Up E-Mail (Drip-Campaign):
 * Wird automatisch 48h nach Öffnung eines noch nicht signierten Angebots versendet.
 * 
 * @param {Object} params
 * @param {string} params.to - E-Mail des Kunden
 * @param {string} [params.clientName] - Name des Kunden
 * @param {string} [params.agencyName] - Name der Agentur / des Freelancers
 * @param {string} [params.agencyEmail] - E-Mail der Agentur (wird als Reply-To gesetzt)
 * @param {string} [params.proposalCategory] - Projekttitel / Kategorie
 * @param {string} params.shareUrl - Magic Link zum Angebot
 * @param {string} [params.budget] - Budgetangabe
 */
async function sendFollowUpEmail({
    to,
    clientName = 'Kunde',
    agencyName = 'Deine Agentur',
    agencyEmail = '',
    proposalCategory = 'Projekt-Dokument',
    shareUrl,
    budget = '',
    documentType = 'proposal'
}) {
    const docTypeNames = {
        proposal: 'Angebot',
        briefing: 'Briefing',
        contract: 'Vertrag',
        roadmap: 'Roadmap',
        signoff: 'Abnahmeprotokoll',
        invoice: 'Rechnung'
    };
    const docTypeName = docTypeNames[documentType] || 'Angebot';

    const subject = `Offene Fragen zu unserem ${docTypeName}: "${proposalCategory}"?`;
    const actionUrl = shareUrl || 'https://agencyos.com';

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Follow-Up: ${proposalCategory}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 28px 32px 20px; border-bottom: 1px solid #1e293b;">
                            <div style="font-size: 13px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px;">
                                ${agencyName}
                            </div>
                            <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 6px 0 0 0; letter-spacing: -0.5px;">
                                Kurzes Update zu deinem ${docTypeName}
                            </h1>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 28px 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <p>Hallo <strong>${clientName}</strong>,</p>
                            <p>
                                ich wollte mich kurz erkundigen, ob du bereits Gelegenheit hattest, dir unser ${docTypeName} für <strong>${proposalCategory}</strong>${budget ? ` (Gesamtinvestition: ${budget})` : ''} anzusehen.
                            </p>
                            
                            <p>
                                Gibt es von deiner Seite noch offene Fragen zum Projektumfang, zur Timeline oder zu den Konditionen? Falls du Anpassungswünsche hast oder Details besprechen möchtest, antworte einfach direkt auf diese E-Mail.
                            </p>

                            <div style="background-color: #1e293b; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 24px 0; font-size: 13px; color: #94a3b8;">
                                💡 <strong>Tipp:</strong> Du kannst das ${docTypeName} jederzeit online prüfen und bei Gefallen mit wenigen Klicks direkt im Browser digital freigeben.
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${actionUrl}" target="_blank" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);">
                                    📄 ${docTypeName} jetzt online ansehen &rarr;
                                </a>
                            </div>

                            <p style="margin-top: 24px; font-size: 14px; color: #94a3b8;">
                                Beste Grüße,<br>
                                <strong style="color: #ffffff;">${agencyName}</strong><br>
                                ${agencyEmail ? `<a href="mailto:${agencyEmail}" style="color: #60a5fa; text-decoration: underline;">${agencyEmail}</a>` : ''}
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b;">
                            Bereitgestellt im Auftrag von <strong>${agencyName}</strong> über AgencyOS Secure Portal.
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const textContent = `Hallo ${clientName},\n\nich wollte mich kurz erkundigen, ob du bereits Gelegenheit hattest, dir unser ${docTypeName} für "${proposalCategory}" anzusehen.\n\nGibt es noch offene Fragen oder Anpassungswünsche? Du kannst das ${docTypeName} jederzeit hier online prüfen und digital freigeben:\n${actionUrl}\n\nBeste Grüße,\n${agencyName} (${agencyEmail})`;

    return sendEmail({
        to,
        name: clientName,
        subject,
        htmlContent,
        textContent
    });
}

/**
 * Bestätigungs-E-Mail bei erfolgreicher digitaler Signatur des Angebots
 * 
 * @param {Object} params
 * @param {string} params.to - Empfänger E-Mail (Kunde oder Agentur)
 * @param {string} params.recipientName - Name des Empfängers
 * @param {string} params.signerName - Name des Unterzeichners
 * @param {string} params.signerRole - Rolle des Unterzeichners
 * @param {string} params.agencyName - Name der Agentur
 * @param {string} params.proposalCategory - Projekttitel / Kategorie
 * @param {string} params.shareUrl - Magic Link zum signierten Angebot
 * @param {string} params.signedAt - ISO-Zeitstempel der Signatur
 */
async function sendProposalSignedConfirmation({
    to,
    recipientName = 'Kunde',
    signerName,
    signerRole = 'Auftraggeber',
    agencyName = 'Agentur',
    proposalCategory = 'Projekt-Dokument',
    shareUrl,
    signedAt,
    documentType = 'proposal'
}) {
    if (!to) return { success: false, error: 'Keine Empfängeradresse angegeben.' };

    const docTypeNames = {
        proposal: 'Angebot',
        briefing: 'Briefing',
        contract: 'Vertrag',
        roadmap: 'Roadmap',
        signoff: 'Abnahmeprotokoll',
        invoice: 'Rechnung'
    };
    const docTypeName = docTypeNames[documentType] || 'Angebot';

    const formattedDate = signedAt ? new Date(signedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : new Date().toLocaleString('de-DE');
    const subject = `✍️ Bestätigung: ${docTypeName} "${proposalCategory}" wurde erfolgreich signiert!`;
    const actionUrl = shareUrl || 'https://agencyos.com';

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>${docTypeName} Signiert - Bestätigung</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 28px 32px 20px; border-bottom: 1px solid #1e293b; text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; margin-bottom: 8px;">
                                ✓ Digital Akzeptiert & Signiert
                            </div>
                            <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 6px 0 0 0; letter-spacing: -0.5px;">
                                ${docTypeName} erfolgreich freigegeben
                            </h1>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 28px 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <p>Hallo <strong>${recipientName}</strong>,</p>
                            <p>
                                wir bestätigen hiermit den erfolgreichen digitalen Abschluss für das ${docTypeName} <strong>"${proposalCategory}"</strong> zwischen <strong>${agencyName}</strong> und dem Auftraggeber.
                            </p>

                            <div style="background-color: #1e293b; border-left: 4px solid #10b981; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0; font-size: 14px; color: #e2e8f0;">
                                <div style="font-weight: 700; color: #ffffff; margin-bottom: 8px;">📄 Details der digitalen Signatur:</div>
                                • <strong>Unterzeichner:</strong> ${signerName} (${signerRole})<br>
                                • <strong>Datum & Uhrzeit:</strong> ${formattedDate} Uhr<br>
                                • <strong>Status:</strong> Rechtswirksam signiert
                            </div>

                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${actionUrl}" target="_blank" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);">
                                    📄 Signiertes Dokument online einsehen &rarr;
                                </a>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
                            &copy; 2026 AgencyOS Secure E-Sign Protocol • <a href="https://agencyos.com" style="color: #94a3b8;">agencyos.com</a>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const textContent = `Hallo ${recipientName},\n\ndas ${docTypeName} "${proposalCategory}" wurde erfolgreich von ${signerName} (${signerRole}) am ${formattedDate} digital signiert.\n\nSigniertes Dokument einsehen:\n${actionUrl}\n\nBeste Grüße,\n${agencyName}`;

    return sendEmail({
        to,
        name: recipientName,
        subject,
        htmlContent,
        textContent
    });
}

/**
 * Willkommens-E-Mail: Wird nach erfolgreicher Registrierung gesendet
 * 
 * @param {Object} params
 * @param {string} params.to - E-Mail des Kunden
 * @param {string} [params.name] - Name des Kunden
 */
async function sendWelcomeEmail({ to, name = 'Nutzer' }) {
    const subject = '👋 Willkommen bei AgencyOS!';

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Willkommen bei AgencyOS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 24px; border-bottom: 1px solid #1e293b; text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; padding: 10px 18px; border-radius: 12px; font-weight: 800; font-size: 18px; letter-spacing: -0.5px;">
                                Agency<span style="color: #93c5fd;">OS</span>
                            </div>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 24px 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <p>Hallo <strong>${name}</strong>,</p>
                            <p>herzlich willkommen bei <strong>AgencyOS</strong>! Wir freuen uns sehr, dass du dich registriert hast.</p>
                            <p>Du kannst nun sofort damit beginnen, professionelle Angebote zu erstellen und deinen Vertriebsprozess zu digitalisieren.</p>
                            
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="https://agencyos.com" target="_blank" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);">
                                    🚀 Jetzt einloggen und loslegen &rarr;
                                </a>
                            </div>

                            <p style="font-size: 13px; color: #64748b;">
                                Falls du Fragen hast oder Hilfe benötigst, antworte einfach direkt auf diese E-Mail oder schreibe uns an <a href="mailto:${SUPPORT_EMAIL}" style="color: #60a5fa; text-decoration: underline;">${SUPPORT_EMAIL}</a>.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
                            <p style="margin: 0 0 6px 0;">&copy; 2026 AgencyOS • Betrieben durch <a href="https://reglerproductions.com" style="color: #94a3b8; text-decoration: underline;">Regler Productions</a></p>
                            <p style="margin: 0;">Kittenfeldstr. 2a, 91795 Dollnstein, Deutschland</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const textContent = `Hallo ${name},\n\nherzlich willkommen bei AgencyOS!\nWir freuen uns sehr, dass du dich registriert hast.\n\nJetzt einloggen: https://agencyos.com\n\nDein AgencyOS Team\nsupport@reglerproductions.com`;

    return sendEmail({
        to,
        name,
        subject,
        htmlContent,
        textContent
    });
}

/**
 * Abo-Bestätigungs-E-Mail: Wird nach erfolgreicher Erst-Zahlung bei Stripe gesendet
 * 
 * @param {Object} params
 * @param {string} params.to - E-Mail des Kunden
 * @param {string} [params.name] - Name des Kunden
 * @param {string} [params.portalUrl] - Link zum Stripe Customer Portal
 */
async function sendSubscriptionConfirmedEmail({ to, name = 'Kunde', portalUrl = 'https://agencyos.com' }) {
    const subject = '🎉 Dein Upgrade auf AgencyOS Pro war erfolgreich!';

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Abo bestätigt - AgencyOS Pro</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #030712; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 32px 24px; border-bottom: 1px solid #1e293b; text-align: center;">
                            <div style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; margin-bottom: 8px;">
                                ✓ Pro-Status aktiv
                            </div>
                            <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 6px 0 0 0; letter-spacing: -0.5px;">
                                Willkommen bei AgencyOS Pro
                            </h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 24px 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <p>Hallo <strong>${name}</strong>,</p>
                            <p>deine Zahlung war erfolgreich und dein Account wurde soeben auf <strong>AgencyOS Pro</strong> aktualisiert!</p>
                            
                            <div style="background-color: #1e293b; border-radius: 8px; padding: 14px 18px; color: #94a3b8; font-size: 13px; margin: 20px 0;">
                                🚀 <strong>Deine neuen Vorteile:</strong> Unbegrenzte Angebote, eigene E-Mail Domain, digitale Signaturen, CRM-Webhooks und vieles mehr stehen dir ab sofort zur Verfügung.
                            </div>

                            <p>Deine Zahlungsdetails, Rechnungen und dein Abo kannst du jederzeit bequem über unser Kundenportal verwalten:</p>
                            
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${portalUrl}" target="_blank" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4);">
                                    💳 Zum Kundenportal &rarr;
                                </a>
                            </div>
                            
                            <p style="font-size: 13px; color: #64748b;">
                                Falls du Fragen hast oder Hilfe benötigst, antworte einfach direkt auf diese E-Mail oder schreibe uns an <a href="mailto:${SUPPORT_EMAIL}" style="color: #60a5fa; text-decoration: underline;">${SUPPORT_EMAIL}</a>.
                            </p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
                            <p style="margin: 0 0 6px 0;">&copy; 2026 AgencyOS • Betrieben durch <a href="https://reglerproductions.com" style="color: #94a3b8; text-decoration: underline;">Regler Productions</a></p>
                            <p style="margin: 0;">Kittenfeldstr. 2a, 91795 Dollnstein, Deutschland</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const textContent = `Hallo ${name},\n\ndeine Zahlung war erfolgreich und dein Account wurde auf AgencyOS Pro aktualisiert!\nDeine Rechnungen und Zahlungsdaten kannst du hier verwalten:\n${portalUrl}\n\nDein AgencyOS Team\nsupport@reglerproductions.com`;

    return sendEmail({
        to,
        name,
        subject,
        htmlContent,
        textContent
    });
}

module.exports = {
    sendEmail,
    sendPaymentFailedEmail,
    sendAccountDeletedEmail,
    sendFollowUpEmail,
    sendProposalSignedConfirmation,
    sendWelcomeEmail,
    sendSubscriptionConfirmedEmail,
    isBrevoConfigured,
    isEmailConfigured
};
