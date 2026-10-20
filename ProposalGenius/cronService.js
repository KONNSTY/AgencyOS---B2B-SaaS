/**
 * AgencyOS - Smarte Auto-Follow-Up Background Engine (Drip Campaign)
 * 
 * Überprüft automatisch offene Dokumente und versendet nach 48h ohne Signatur
 * eine personalisierte Follow-Up E-Mail an den Kunden via Brevo.
 */

const { sendFollowUpEmail } = require('./emailService');

const FOLLOW_UP_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 Stunden
let cronIntervalTimer = null;

/**
 * Führt die Prüfung für alle überfälligen Angebote durch
 */
async function checkAndSendFollowUps({ db, memoryProposals }) {
    const stats = {
        checked: 0,
        sent: 0,
        skipped: 0,
        errors: 0
    };

    const now = Date.now();
    console.log(`\n⏰ [Auto-Follow-Up Cron] Starte Überprüfung der offenen Angebote (${new Date().toISOString()})...`);

    const proposalsToCheck = [];

    // 1. Daten aus Firestore abrufen
    if (db) {
        try {
            const snapshot = await db.collection('proposals')
                .where('status', '==', 'pending')
                .get();

            snapshot.forEach(doc => {
                const data = doc.data();
                proposalsToCheck.push({ id: doc.id, ...data, isFirestore: true });
            });
        } catch (dbError) {
            console.warn('⚠️ [Auto-Follow-Up Cron] Firestore Abfragefehler, nutze ggf. Memory-Store:', dbError.message);
        }
    }

    // 2. Fallback: Memory-Store prüfen
    if (memoryProposals && memoryProposals.size > 0) {
        for (const [id, data] of memoryProposals.entries()) {
            if (!proposalsToCheck.some(p => p.id === id) && data.status === 'pending') {
                proposalsToCheck.push({ id, ...data, isMemory: true });
            }
        }
    }

    stats.checked = proposalsToCheck.length;

    for (const proposal of proposalsToCheck) {
        try {
            // Auto-Follow-Up muss aktiviert sein
            if (proposal.autoFollowUp === false) {
                stats.skipped++;
                continue;
            }

            // Wenn bereits ein Follow-Up gesendet wurde: Überspringen
            if (proposal.followUpSentAt) {
                stats.skipped++;
                continue;
            }

            // E-Mail des Kunden muss vorhanden sein
            if (!proposal.clientEmail || !proposal.clientEmail.includes('@')) {
                stats.skipped++;
                continue;
            }

            // 48h Zeitstempel-Prüfung: Bezug auf openedAt (wenn geöffnet) oder createdAt
            const referenceTimeStr = proposal.firstViewedAt || proposal.openedAt || proposal.createdAt;
            if (!referenceTimeStr) {
                stats.skipped++;
                continue;
            }

            const referenceTime = new Date(referenceTimeStr).getTime();
            const elapsedMs = now - referenceTime;

            if (elapsedMs < FOLLOW_UP_THRESHOLD_MS) {
                // Noch keine 48h vergangen
                stats.skipped++;
                continue;
            }

            // Bedingungen erfüllt: Follow-Up E-Mail senden
            console.log(`📨 [Auto-Follow-Up] Sende Follow-Up für Angebot #${proposal.id} an ${proposal.clientEmail} (Offen seit ${Math.round(elapsedMs / (1000 * 60 * 60))}h)...`);

            const emailResult = await sendFollowUpEmail({
                to: proposal.clientEmail,
                clientName: proposal.clientName || 'Kunde',
                agencyName: proposal.agencyName || 'Deine Agentur',
                agencyEmail: proposal.agencyEmail || '',
                proposalCategory: proposal.category || 'Projektangebot',
                shareUrl: proposal.shareUrl,
                budget: proposal.budget || '',
                documentType: proposal.documentType || 'proposal'
            });

            if (emailResult.success) {
                const updatePayload = {
                    followUpSentAt: new Date().toISOString(),
                    followUpCount: (proposal.followUpCount || 0) + 1,
                    followUpStatus: 'sent'
                };

                if (db && proposal.isFirestore) {
                    await db.collection('proposals').doc(proposal.id).set(updatePayload, { merge: true });
                }
                if (memoryProposals && memoryProposals.has(proposal.id)) {
                    const existing = memoryProposals.get(proposal.id);
                    memoryProposals.set(proposal.id, { ...existing, ...updatePayload });
                }

                stats.sent++;
                console.log(`✅ [Auto-Follow-Up] Follow-Up für Angebot #${proposal.id} erfolgreich versendet.`);
            } else {
                stats.errors++;
                console.error(`❌ [Auto-Follow-Up] Fehler beim Versand für #${proposal.id}:`, emailResult.error);
            }
        } catch (err) {
            stats.errors++;
            console.error(`❌ [Auto-Follow-Up] Verarbeitungsfehler bei Angebot #${proposal.id}:`, err.message);
        }
    }

    console.log(`📊 [Auto-Follow-Up Cron] Zusammenfassung: ${stats.sent} gesendet, ${stats.skipped} übersprungen, ${stats.errors} Fehler von ${stats.checked} geprüften Angeboten.\n`);
    return stats;
}

/**
 * Manuelle Einzelauslösung für ein bestimmtes Angebot (z.B. Test im Dashboard)
 */
async function triggerSingleProposalFollowUp(proposalId, { db, memoryProposals, force = false }) {
    let proposal = null;

    if (db) {
        const docSnap = await db.collection('proposals').doc(proposalId).get();
        if (docSnap.exists) {
            proposal = { id: docSnap.id, ...docSnap.data(), isFirestore: true };
        }
    }

    if (!proposal && memoryProposals && memoryProposals.has(proposalId)) {
        proposal = { id: proposalId, ...memoryProposals.get(proposalId), isMemory: true };
    }

    if (!proposal) {
        throw new Error('Angebot nicht gefunden.');
    }

    if (!proposal.clientEmail) {
        throw new Error('Für dieses Angebot ist keine Kunden-E-Mail hinterlegt.');
    }

    if (proposal.status === 'signed' && !force) {
        throw new Error('Dieses Angebot ist bereits rechtsverbindlich signiert.');
    }

    const emailResult = await sendFollowUpEmail({
        to: proposal.clientEmail,
        clientName: proposal.clientName || 'Kunde',
        agencyName: proposal.agencyName || 'Deine Agentur',
        agencyEmail: proposal.agencyEmail || '',
        proposalCategory: proposal.category || 'Projektangebot',
        shareUrl: proposal.shareUrl,
        budget: proposal.budget || '',
        documentType: proposal.documentType || 'proposal'
    });

    if (!emailResult.success) {
        throw new Error(emailResult.error || 'Fehler beim E-Mail-Versand.');
    }

    const updatePayload = {
        followUpSentAt: new Date().toISOString(),
        followUpCount: (proposal.followUpCount || 0) + 1,
        followUpStatus: 'sent'
    };

    if (db && proposal.isFirestore) {
        await db.collection('proposals').doc(proposal.id).set(updatePayload, { merge: true });
    }
    if (memoryProposals && memoryProposals.has(proposal.id)) {
        const existing = memoryProposals.get(proposal.id);
        memoryProposals.set(proposal.id, { ...existing, ...updatePayload });
    }

    return {
        success: true,
        message: `Follow-Up E-Mail erfolgreich an ${proposal.clientEmail} versendet.`,
        proposalId,
        sentAt: updatePayload.followUpSentAt
    };
}

/**
 * Initialisiert den Cron-Intervall-Runner
 */
function startCronEngine({ db, memoryProposals, checkIntervalMs = 15 * 60 * 1000 }) {
    if (cronIntervalTimer) {
        clearInterval(cronIntervalTimer);
    }

    console.log(`🤖 [Cron Engine] Auto-Follow-Up Worker gestartet (Intervall: alle ${Math.round(checkIntervalMs / 60000)} Min).`);

    // Sofortige erste Prüfung nach 5 Sekunden Serverstart
    setTimeout(() => {
        checkAndSendFollowUps({ db, memoryProposals }).catch(err => {
            console.warn('⚠️ [Cron Engine] Fehler beim ersten Durchlauf:', err.message);
        });
    }, 5000);

    cronIntervalTimer = setInterval(() => {
        checkAndSendFollowUps({ db, memoryProposals }).catch(err => {
            console.error('❌ [Cron Engine] Fehler im periodischen Durchlauf:', err.message);
        });
    }, checkIntervalMs);

    return {
        stop: () => clearInterval(cronIntervalTimer)
    };
}

module.exports = {
    startCronEngine,
    checkAndSendFollowUps,
    triggerSingleProposalFollowUp,
    FOLLOW_UP_THRESHOLD_MS
};
