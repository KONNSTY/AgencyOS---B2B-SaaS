/**
 * AgencyOS - Client-Facing E-Sign & Viewing Engine (view.js)
 * Features:
 * - Secure Token-Based Proposal Retrieval
 * - Feature 1: SignaturePad HTML5 Canvas Digital Signature
 * - Feature 3: Real-Time Proposal Tracking (Open Events & Active Time Spent Heartbeat)
 * - Feature 4: Internationalization (i18n Multi-Language Client Rendering: DE, EN, FR, ES)
 */

let currentProposal = null;
let signaturePad = null;
let proposalId = null;
let securityToken = null;

// Tracking State
let heartbeatTimer = null;
let activeSessionStartTime = Date.now();
let accumulatedUnsentSeconds = 0;
const HEARTBEAT_INTERVAL_MS = 15000;

// i18n Client Dictionary
const viewI18n = {
    de: {
        badgeText: "Projektangebot",
        dateLabel: "Datum:",
        numberLabel: "Angebots-Nr.:",
        clientLabel: "Erstellt für den Kunden",
        categoryLabel: "Projekt",
        timelineLabel: "Umsetzungszeitraum / Timeline",
        budgetLabel: "Gesamtinvestition (Netto)",
        validityLabel: "Gültigkeit: 14 Tage ab Angebotsdatum",
        statusWaiting: "Wartet auf Signatur",
        statusSigned: "Rechtsverbindlich signiert",
        auditTitle: "Digitale E-Signatur & Rechtsgültiger Audit-Trail",
        auditVerified: "Verifiziert",
        auditSigner: "Unterzeichnet von:",
        auditTimestamp: "Zeitstempel (UTC/Lokal):",
        auditStatus: "Status:",
        auditStatusVal: "Rechtsverbindlich freigegeben",
        auditVisual: "Visuelle Unterschrift:",
        bottomBarTitleWait: "Projektangebot prüfen & digital bestätigen",
        bottomBarSubWait: "Unterzeichne direkt im Browser ohne Ausdrucken oder Scannen.",
        bottomBarTitleDone: "Projektangebot ist freigegeben",
        bottomBarSubDone: "Dieses Angebot wurde rechtswirksam bestätigt. Du kannst dir jederzeit ein PDF sichern.",
        downloadPdf: "PDF sichern",
        signBtnText: "Jetzt digital signieren",
        signBtnDone: "Bereits unterzeichnet",
        modalTitle: "Angebot rechtsverbindlich signieren",
        modalSubtitle: "Zeichne deine Unterschrift mit Finger, Stift oder Maus",
        signerNameLabel: "Vollständiger Name *",
        signerRoleLabel: "Position / Rolle",
        canvasLabel: "Deine Unterschrift *",
        clearCanvas: "Feld leeren",
        legalNotice: "Mit Klick auf \"Verbindlich signieren\" bestätigst du dieses Angebot zu den genannten Konditionen rechtswirksam.",
        cancelBtn: "Abbrechen",
        submitSignBtn: "Verbindlich signieren",
        signingInProgress: "Wird signiert...",
        signSuccessAlert: "🎉 Vielen Dank! Das Angebot wurde erfolgreich rechtsverbindlich unterzeichnet. Dein Dienstleister wurde automatisch benachrichtigt.",
        canvasEmptyAlert: "Bitte zeichne deine Unterschrift in das vorgesehene Feld.",
        locale: "de-DE"
    },
    en: {
        badgeText: "Commercial Proposal",
        dateLabel: "Date:",
        numberLabel: "Proposal No.:",
        clientLabel: "Prepared for Client",
        categoryLabel: "Project",
        timelineLabel: "Execution Timeline",
        budgetLabel: "Total Investment (Net)",
        validityLabel: "Validity: 14 days from proposal issue date",
        statusWaiting: "Awaiting Signature",
        statusSigned: "Legally Signed",
        auditTitle: "Digital E-Signature & Audit Trail",
        auditVerified: "Verified",
        auditSigner: "Signed by:",
        auditTimestamp: "Timestamp (UTC/Local):",
        auditStatus: "Status:",
        auditStatusVal: "Legally Approved & Signed",
        auditVisual: "Visual Signature:",
        bottomBarTitleWait: "Review & approve project proposal",
        bottomBarSubWait: "Sign legally in your browser without printing or scanning.",
        bottomBarTitleDone: "Project proposal approved",
        bottomBarSubDone: "This agreement is officially sealed. You can download a PDF copy anytime.",
        downloadPdf: "Download PDF",
        signBtnText: "Sign proposal digitally",
        signBtnDone: "Already Signed",
        modalTitle: "Sign proposal digitally",
        modalSubtitle: "Draw your signature using touch, stylus, or mouse",
        signerNameLabel: "Full Name *",
        signerRoleLabel: "Title / Organization Role",
        canvasLabel: "Your Signature *",
        clearCanvas: "Clear",
        legalNotice: "By clicking \"Confirm & Sign\", you legally accept this commercial proposal under the agreed terms.",
        cancelBtn: "Cancel",
        submitSignBtn: "Confirm & Sign",
        signingInProgress: "Signing...",
        signSuccessAlert: "🎉 Thank you! The proposal has been successfully signed. Your agency has been notified.",
        canvasEmptyAlert: "Please draw your signature in the designated box.",
        locale: "en-US"
    },
    fr: {
        badgeText: "Proposition Commerciale",
        dateLabel: "Date :",
        numberLabel: "N° Proposition :",
        clientLabel: "Établi pour le client",
        categoryLabel: "Projet",
        timelineLabel: "Délai d'exécution",
        budgetLabel: "Investissement Total (HT)",
        validityLabel: "Validité : 14 jours à compter de l'émission",
        statusWaiting: "En attente de signature",
        statusSigned: "Signé juridiquement",
        auditTitle: "Signature électronique & Piste d'audit légale",
        auditVerified: "Vérifié",
        auditSigner: "Signé par :",
        auditTimestamp: "Horodatage :",
        auditStatus: "Statut :",
        auditStatusVal: "Validé et signé juridiquement",
        auditVisual: "Signature manuscrite :",
        bottomBarTitleWait: "Examiner & valider la proposition",
        bottomBarSubWait: "Signez directement en ligne sans imprimer ni scanner.",
        bottomBarTitleDone: "Proposition commerciale validée",
        bottomBarSubDone: "Cette proposition a été formellement acceptée. Téléchargez votre copie PDF à tout moment.",
        downloadPdf: "Télécharger le PDF",
        signBtnText: "Signer numériquement",
        signBtnDone: "Déjà signé",
        modalTitle: "Signature de la proposition",
        modalSubtitle: "Tracez votre signature au doigt, stylet ou à la souris",
        signerNameLabel: "Nom et Prénom *",
        signerRoleLabel: "Fonction / Rôle",
        canvasLabel: "Votre signature *",
        clearCanvas: "Effacer",
        legalNotice: "En cliquant sur \"Valider la signature\", vous acceptez formellement cette proposition commerciale.",
        cancelBtn: "Annuler",
        submitSignBtn: "Valider la signature",
        signingInProgress: "Signature en cours...",
        signSuccessAlert: "🎉 Merci beaucoup ! La proposition a été signée avec succès. Votre prestataire a été notifié.",
        canvasEmptyAlert: "Veuillez apposer votre signature dans le cadre prévu à cet effet.",
        locale: "fr-FR"
    },
    es: {
        badgeText: "Propuesta de Proyecto",
        dateLabel: "Fecha:",
        numberLabel: "Nº Propuesta:",
        clientLabel: "Elaborado para el cliente",
        categoryLabel: "Proyecto",
        timelineLabel: "Plazo de ejecución",
        budgetLabel: "Inversión Total (Neto)",
        validityLabel: "Validez: 14 días a partir de la fecha",
        statusWaiting: "Pendiente de firma",
        statusSigned: "Firmado legalmente",
        auditTitle: "Firma digital & Pista de auditoría legal",
        auditVerified: "Verificado",
        auditSigner: "Firmado por:",
        auditTimestamp: "Fecha y hora:",
        auditStatus: "Estado:",
        auditStatusVal: "Aprobado y formalizado",
        auditVisual: "Firma manuscrita:",
        bottomBarTitleWait: "Revisar y confirmar propuesta de proyecto",
        bottomBarSubWait: "Firme directamente en el navegador sin imprimir ni escanear.",
        bottomBarTitleDone: "Propuesta formalizada",
        bottomBarSubDone: "Esta propuesta ha sido aprobada legalmente. Puede descargar su copia en PDF.",
        downloadPdf: "Guardar PDF",
        signBtnText: "Firmar digitalmente",
        signBtnDone: "Ya firmado",
        modalTitle: "Firmar propuesta legalmente",
        modalSubtitle: "Dibuje su firma con el dedo, lápiz o ratón",
        signerNameLabel: "Nombre completo *",
        signerRoleLabel: "Cargo / Puesto",
        canvasLabel: "Su firma *",
        clearCanvas: "Borrar",
        legalNotice: "Al hacer clic en \"Firmar legalmente\", usted confirma y acepta los términos de esta propuesta comercial.",
        cancelBtn: "Cancelar",
        submitSignBtn: "Firmar legalmente",
        signingInProgress: "Firmando...",
        signSuccessAlert: "🎉 ¡Muchas gracias! La propuesta ha sido firmada exitosamente. Su proveedor ha sido notificado.",
        canvasEmptyAlert: "Por favor dibuje su firma en el recuadro correspondiente.",
        locale: "es-ES"
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initViewPage();
});

function initDsgvoBanner() {
    const banner = document.getElementById('dsgvoCookieBanner');
    const acceptBtn = document.getElementById('acceptDsgvoCookiesBtn');
    if (!banner || !acceptBtn) return;

    if (!localStorage.getItem('dsgvo_consent_accepted')) {
        banner.classList.remove('hidden');
    }

    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('dsgvo_consent_accepted', 'true');
        banner.classList.add('hidden');
    });
}

async function initViewPage() {
    initDsgvoBanner();
    const urlParams = new URLSearchParams(window.location.search);
    proposalId = urlParams.get('id');
    securityToken = urlParams.get('token');

    if (!proposalId || !securityToken) {
        showError("Ungültiger Zugriffslink", "Bitte überprüfe den Link, den du von deiner Agentur erhalten hast.");
        return;
    }

    setupSignaturePad();
    bindViewEvents();
    await loadProposalData();
    initTrackingEngine();
}

async function loadProposalData() {
    const loader = document.getElementById('viewLoader');
    const container = document.getElementById('proposalContainer');
    const bottomBar = document.getElementById('stickyBottomBar');

    try {
        const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}?token=${encodeURIComponent(securityToken)}`);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || "Angebot konnte nicht geladen werden.");
        }

        const data = await response.json();
        currentProposal = data.proposal;
        const branding = data.branding || null;

        renderProposal(currentProposal, branding);

        loader.classList.add('hidden');
        container.classList.remove('hidden');
        bottomBar.classList.remove('hidden');

    } catch (error) {
        console.error("Fehler beim Laden des Angebots:", error);
        loader.classList.add('hidden');
        showError("Zugriff verweigert", error.message);
    }
}

function renderProposal(p, branding = null) {
    const lang = p.language || 'de';
    const dict = { ...(viewI18n[lang] || viewI18n.de) };

    // Dynamic text overrides based on documentType
    const docType = p.documentType || 'proposal';

    const docTypesDe = {
        proposal: { 
            badge: "Projektangebot", 
            bottomTitleWait: "Projektangebot prüfen & digital bestätigen", 
            bottomSubWait: "Unterzeichne direkt im Browser ohne Ausdrucken oder Scannen.",
            bottomTitleDone: "Projektangebot ist freigegeben",
            bottomSubDone: "Dieses Angebot wurde rechtswirksam bestätigt. Du kannst dir jederzeit ein PDF sichern.",
            modalTitle: "Angebot rechtsverbindlich signieren", 
            signBtn: "Jetzt digital signieren",
            legalNotice: "Mit Klick auf \"Verbindlich signieren\" bestätigst du dieses Angebot zu den genannten Konditionen rechtswirksam."
        },
        briefing: { 
            badge: "Briefing / Scope", 
            bottomTitleWait: "Projektbriefing prüfen & freigeben", 
            bottomSubWait: "Bestätige die Anforderungen direkt im Browser.",
            bottomTitleDone: "Briefing ist freigegeben",
            bottomSubDone: "Dieses Briefing wurde erfolgreich bestätigt. Du kannst dir jederzeit ein PDF sichern.",
            modalTitle: "Briefing digital freigeben", 
            signBtn: "Briefing freigeben",
            legalNotice: "Mit Klick auf \"Verbindlich signieren\" bestätigst du dieses Briefing und die darin enthaltenen Anforderungen."
        },
        contract: { 
            badge: "Projektvertrag", 
            bottomTitleWait: "Dienstleistungsvertrag prüfen & unterzeichnen", 
            bottomSubWait: "Unterzeichne den Vertrag rechtsgültig im Browser.",
            bottomTitleDone: "Projektvertrag ist unterzeichnet",
            bottomSubDone: "Dieser Dienstleistungsvertrag wurde rechtsgültig unterzeichnet. Du kannst dir jederzeit ein PDF sichern.",
            modalTitle: "Vertrag rechtsverbindlich unterzeichnen", 
            signBtn: "Jetzt digital unterzeichnen",
            legalNotice: "Mit Klick auf \"Verbindlich signieren\" unterzeichnest du diesen Vertrag und das Statement of Work rechtsverbindlich."
        },
        roadmap: { 
            badge: "Roadmap / Onboarding", 
            bottomTitleWait: "Kickoff-Roadmap prüfen & bestätigen", 
            bottomSubWait: "Bestätige den Fahrplan direkt im Browser.",
            bottomTitleDone: "Roadmap ist bestätigt",
            bottomSubDone: "Die Onboarding-Roadmap wurde bestätigt. Du kannst dir jederzeit ein PDF sichern.",
            modalTitle: "Roadmap digital freigeben", 
            signBtn: "Roadmap bestätigen",
            legalNotice: "Mit Klick auf \"Verbindlich signieren\" bestätigst du die Meilensteine und Termine dieser Roadmap."
        },
        signoff: { 
            badge: "Abnahmeprotokoll", 
            bottomTitleWait: "Projektabnahme prüfen & unterzeichnen", 
            bottomSubWait: "Bestätige die erfolgreiche Abnahme direkt im Browser.",
            bottomTitleDone: "Projektabnahme ist unterzeichnet",
            bottomSubDone: "Die Abnahme wurde erfolgreich unterzeichnet. Du kannst dir jederzeit ein PDF sichern.",
            modalTitle: "Projektabnahme rechtsverbindlich unterzeichnen", 
            signBtn: "Abnahme unterzeichnen",
            legalNotice: "Mit Klick auf \"Verbindlich signieren\" erklärst du das Projekt für erfolgreich abgenommen und fertiggestellt."
        },
        invoice: { 
            badge: "Rechnung / Vorab-Rechnung", 
            bottomTitleWait: "Rechnung prüfen & freigeben", 
            bottomSubWait: "Bestätige die Rechnung zur Zahlungsfreigabe.",
            bottomTitleDone: "Rechnung ist freigegeben",
            bottomSubDone: "Diese Rechnung wurde freigegeben. Du kannst dir jederzeit ein PDF sichern.",
            modalTitle: "Rechnung digital bestätigen", 
            signBtn: "Rechnung freigeben",
            legalNotice: "Mit Klick auf \"Verbindlich signieren\" bestätigst du den Erhalt und die Richtigkeit dieser Rechnung zur Zahlung."
        }
    };

    const docTypesEn = {
        proposal: { 
            badge: "Commercial Proposal", 
            bottomTitleWait: "Review & confirm project proposal", 
            bottomSubWait: "Sign directly in the browser without printing or scanning.",
            bottomTitleDone: "Proposal is approved",
            bottomSubDone: "This proposal has been legally confirmed. You can save a PDF at any time.",
            modalTitle: "Sign proposal electronically", 
            signBtn: "Sign Proposal",
            legalNotice: "By clicking \"Sign document\", you confirm this proposal under the terms mentioned."
        },
        briefing: { 
            badge: "Briefing / Scope", 
            bottomTitleWait: "Review & approve project briefing", 
            bottomSubWait: "Approve the scoping requirements directly in your browser.",
            bottomTitleDone: "Briefing is approved",
            bottomSubDone: "This briefing scope has been approved. You can save a PDF at any time.",
            modalTitle: "Approve briefing scope", 
            signBtn: "Approve Briefing",
            legalNotice: "By clicking \"Sign document\", you confirm the project briefing and its scoped requirements."
        },
        contract: { 
            badge: "Project Contract", 
            bottomTitleWait: "Review & sign service agreement", 
            bottomSubWait: "Sign the contract legally inside your browser.",
            bottomTitleDone: "Contract is signed",
            bottomSubDone: "This agreement has been legally signed. You can save a PDF at any time.",
            modalTitle: "Sign contract electronically", 
            signBtn: "Sign Contract",
            legalNotice: "By clicking \"Sign document\", you execute this service agreement and SOW legally."
        },
        roadmap: { 
            badge: "Roadmap / Onboarding", 
            bottomTitleWait: "Review & confirm kickoff roadmap", 
            bottomSubWait: "Confirm the onboarding timeline and phases inside your browser.",
            bottomTitleDone: "Roadmap is confirmed",
            bottomSubDone: "The onboarding roadmap has been confirmed. You can save a PDF at any time.",
            modalTitle: "Confirm onboarding roadmap", 
            signBtn: "Confirm Roadmap",
            legalNotice: "By clicking \"Sign document\", you approve the milestones and key dates of this roadmap."
        },
        signoff: { 
            badge: "Acceptance Protocol", 
            bottomTitleWait: "Review & sign off project acceptance", 
            bottomSubWait: "Confirm completion and sign off acceptance inside your browser.",
            bottomTitleDone: "Project is signed off",
            bottomSubDone: "The project acceptance has been signed off. You can save a PDF at any time.",
            modalTitle: "Sign off project acceptance", 
            signBtn: "Sign Off Project",
            legalNotice: "By clicking \"Sign document\", you declare the project fully accepted and completed."
        },
        invoice: { 
            badge: "Invoice / Pre-invoice", 
            bottomTitleWait: "Review & approve invoice charges", 
            bottomSubWait: "Confirm the invoice details to authorize payment processing.",
            bottomTitleDone: "Invoice is authorized",
            bottomSubDone: "This invoice has been authorized for payment. You can save a PDF at any time.",
            modalTitle: "Confirm invoice authorization", 
            signBtn: "Authorize Payment",
            legalNotice: "By clicking \"Sign document\", you acknowledge receipt and accuracy of this invoice."
        }
    };

    const currentDocMap = (lang === 'de' ? docTypesDe[docType] : docTypesEn[docType]) || (lang === 'de' ? docTypesDe.proposal : docTypesEn.proposal);

    // Apply Overrides to dict
    dict.badgeText = currentDocMap.badge;
    dict.bottomBarTitleWait = currentDocMap.bottomTitleWait;
    dict.bottomBarSubWait = currentDocMap.bottomSubWait;
    dict.bottomBarTitleDone = currentDocMap.bottomTitleDone;
    dict.bottomBarSubDone = currentDocMap.bottomSubDone;
    dict.modalTitle = currentDocMap.modalTitle;
    dict.signBtnText = currentDocMap.signBtn;
    dict.submitSignBtn = currentDocMap.signBtn;
    dict.legalNotice = currentDocMap.legalNotice;

    // Apply i18n Labels
    document.getElementById('docBadgeText').textContent = dict.badgeText;
    document.getElementById('docDateLabel').textContent = dict.dateLabel;
    document.getElementById('docNumberLabel').textContent = dict.numberLabel;
    document.getElementById('docClientLabel').textContent = dict.clientLabel;
    document.getElementById('docCategoryLabel').textContent = dict.categoryLabel;
    document.getElementById('docTimelineLabel').textContent = dict.timelineLabel;
    document.getElementById('docBudgetLabel').textContent = dict.budgetLabel;
    document.getElementById('docValidityLabel').textContent = dict.validityLabel;

    // Modal i18n
    document.getElementById('signModalTitle').textContent = dict.modalTitle;
    document.getElementById('signModalSubtitle').textContent = dict.modalSubtitle;
    document.getElementById('signerNameInputLabel').textContent = dict.signerNameLabel;
    document.getElementById('signerRoleInputLabel').textContent = dict.signerRoleLabel;
    document.getElementById('signatureCanvasLabel').textContent = dict.canvasLabel;
    document.getElementById('clearCanvasBtn').textContent = dict.clearCanvas;
    document.getElementById('signLegalNotice').textContent = dict.legalNotice;
    document.getElementById('cancelSignBtn').textContent = dict.cancelBtn;
    document.getElementById('submitSignBtnText').textContent = dict.submitSignBtn;
    document.getElementById('downloadPdfBtnText').textContent = dict.downloadPdf;

    // Values
    const agencyName = (branding && branding.agencyName) || p.agencyName || 'Agentur';
    document.getElementById('docAgency').textContent = agencyName;
    document.getElementById('docEmail').textContent = p.agencyEmail || '';
    document.getElementById('docDate').textContent = p.createdAt ? new Date(p.createdAt).toLocaleDateString(dict.locale) : '-';
    document.getElementById('docNumber').textContent = p.proposalNumber || `PG-${proposalId.slice(0, 6).toUpperCase()}`;
    document.getElementById('docClient').textContent = p.clientName || 'Kunde';
    document.getElementById('docCategory').textContent = p.category || 'Projektangebot';
    document.getElementById('docDeadline').textContent = p.deadline || '-';
    document.getElementById('docBudget').textContent = p.budget || '-';

    // Body Text
    document.getElementById('aiTextContent').innerHTML = p.proposalHTML || '<p>Kein Text hinterlegt.</p>';

    // Logo & Branding (Feature 1: White-Labeling)
    const logoUrl = (branding && branding.brandLogoUrl) || p.logoUrl || '';
    if (logoUrl) {
        const logo = document.getElementById('docLogo');
        logo.src = logoUrl;
        logo.classList.remove('hidden');

        const headerLogo = document.getElementById('headerBrandLogo');
        const headerIcon = document.getElementById('headerBrandIcon');
        if (headerLogo && headerIcon) {
            headerLogo.src = logoUrl;
            headerLogo.classList.remove('hidden');
            headerIcon.classList.add('hidden');
        }
    }

    if (branding) {
        if (branding.agencyName) {
            const headerTitle = document.getElementById('headerBrandTitle');
            if (headerTitle) headerTitle.textContent = `${branding.agencyName} Portal`;
        }

        if (branding.brandPrimaryColor) {
            document.documentElement.style.setProperty('--primary-brand-color', branding.brandPrimaryColor);
        }

        if (branding.hideBranding === true) {
            const engineNotice = document.getElementById('docEngineNotice');
            if (engineNotice) engineNotice.textContent = `${agencyName} Secure Portal`;

            const footerLeft = document.getElementById('footerBrandLeft');
            if (footerLeft) {
                footerLeft.innerHTML = `&copy; ${new Date().getFullYear()} ${agencyName} • Alle Rechte vorbehalten.`;
            }

            const viralBanner = document.getElementById('viralGrowthBanner');
            if (viralBanner) viralBanner.classList.add('hidden');
        } else {
            const viralBanner = document.getElementById('viralGrowthBanner');
            if (viralBanner) viralBanner.classList.remove('hidden');
        }
    }

    // Dynamic Interactive ROI Calculator (Feature 2)
    setupRoiCalculator(p.roiCalculator);

    // Apply Theme (Feature 5)
    const exportDoc = document.getElementById('export-document');
    if (exportDoc) {
        const theme = p.theme || 'modern-minimal';
        const allThemes = [
            'modern-minimal', 'tech-stark', 'creative-bold',
            'executive-corporate', 'startup-vibrant', 'luxury-gold',
            'eco-sustainable', 'architectural-grid', 'bold-agency',
            'financial-trust', 'creative-dark', 'minimal-warmth',
            'cyber-security', 'consulting-pro', 'ecommerce-growth',
            'editorial-magazine', 'neon-punch', 'simple-mono',
            'corporate', 'minimalist', 'creative'
        ];
        allThemes.forEach(t => exportDoc.classList.remove(`theme-${t}`));
        
        let resolvedTheme = theme;
        if (theme === 'corporate' || theme === 'minimalist') resolvedTheme = 'modern-minimal';
        if (theme === 'creative') resolvedTheme = 'creative-bold';

        exportDoc.classList.add(`theme-${resolvedTheme}`);
    }

    // Status UI
    updateStatusUI(p);
}

/**
 * Feature 2: Interactive Real-Time ROI Calculator
 */
function setupRoiCalculator(roi) {
    const container = document.getElementById('roiCalculatorContainer');
    if (!container) return;

    if (!roi || !roi.enabled) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const titleEl = document.getElementById('roiCalcTitle');
    const descEl = document.getElementById('roiCalcDesc');
    const sliderLabelEl = document.getElementById('roiSliderLabelText');
    const sliderUnitEl = document.getElementById('roiSliderUnitText');
    const sliderInput = document.getElementById('roiSliderInput');
    const sliderValDisplay = document.getElementById('roiSliderValDisplay');
    const minLabel = document.getElementById('roiMinLabel');
    const midLabel = document.getElementById('roiMidLabel');
    const maxLabel = document.getElementById('roiMaxLabel');
    const monthlyResultEl = document.getElementById('roiMonthlyResult');
    const annualResultEl = document.getElementById('roiAnnualResult');
    const resultLabelEl = document.getElementById('roiResultLabel');

    const min = roi.min || 1;
    const max = roi.max || 50;
    const step = roi.step || 1;
    const defaultVal = roi.defaultValue || 10;
    const unit = roi.unit || 'Kunden';
    const baseValue = roi.baseValue || 500;
    const multiplier = roi.multiplier || 12;
    const prefix = roi.resultPrefix || 'ca. ';
    const suffix = roi.resultSuffix || ' € / Jahr';

    if (titleEl) titleEl.textContent = roi.title || 'Geschätzter Mehrumsatz & ROI-Rechner';
    if (descEl) descEl.textContent = roi.description || 'Passe den Schieberegler an dein individuelles Potenzial an:';
    if (sliderLabelEl) sliderLabelEl.textContent = `${roi.sliderLabel || 'Zusätzliche Neukunden'}:`;
    if (sliderUnitEl) sliderUnitEl.textContent = unit;
    if (resultLabelEl) resultLabelEl.textContent = roi.resultLabel || 'Geschätzter jährlicher Mehrertrag';

    if (sliderInput) {
        sliderInput.min = min;
        sliderInput.max = max;
        sliderInput.step = step;
        sliderInput.value = defaultVal;
    }

    if (minLabel) minLabel.textContent = `${min} ${unit}`;
    if (midLabel) midLabel.textContent = `${Math.round((min + max) / 2)} ${unit}`;
    if (maxLabel) maxLabel.textContent = `${max}+ ${unit}`;

    const updateCalc = () => {
        const currentCount = parseInt(sliderInput.value, 10) || 0;
        if (sliderValDisplay) sliderValDisplay.textContent = currentCount.toLocaleString('de-DE');

        const monthlyVal = currentCount * baseValue;
        const annualVal = monthlyVal * multiplier;

        if (monthlyResultEl) {
            monthlyResultEl.textContent = `ca. ${monthlyVal.toLocaleString('de-DE')} €`;
        }
        if (annualResultEl) {
            annualResultEl.textContent = `${prefix}${annualVal.toLocaleString('de-DE')}${suffix}`;
        }
    };

    if (sliderInput) {
        sliderInput.oninput = updateCalc;
    }

    updateCalc();
}

function updateStatusUI(p) {
    const lang = p.language || 'de';
    const dict = viewI18n[lang] || viewI18n.de;

    const statusBadge = document.getElementById('proposalStatusBadge');
    const auditBox = document.getElementById('signatureAuditBox');
    const openSignModalBtn = document.getElementById('openSignModalBtn');
    const bottomBarTitle = document.getElementById('bottomBarTitle');
    const bottomBarSubtitle = document.getElementById('bottomBarSubtitle');
    const openSignModalBtnText = document.getElementById('openSignModalBtnText');

    if (p.status === 'signed') {
        statusBadge.className = "inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
        statusBadge.innerHTML = `
            <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>${dict.statusSigned}</span>
        `;

        if (p.signature) {
            auditBox.classList.remove('hidden');
            document.getElementById('auditTitleText').textContent = dict.auditTitle;
            document.getElementById('auditVerifiedBadge').textContent = dict.auditVerified;
            document.getElementById('auditSignerLabel').textContent = dict.auditSigner;
            document.getElementById('auditDateLabel').textContent = dict.auditTimestamp;
            document.getElementById('auditStatusLabel').textContent = dict.auditStatus;
            document.getElementById('auditStatusVal').textContent = dict.auditStatusVal;
            document.getElementById('auditVisualLabel').textContent = dict.auditVisual;

            document.getElementById('auditSignerName').textContent = `${p.signature.signerName} ${p.signature.signerRole ? '(' + p.signature.signerRole + ')' : ''}`;
            document.getElementById('auditSignedAt').textContent = new Date(p.signature.signedAt).toLocaleString(dict.locale);
            document.getElementById('auditIp').textContent = p.signature.ipAddress || 'Verifiziert';
            
            const rawAuditString = `${p.id || ''}_${p.signature.signedAt}_${p.signature.signerName}_${p.signature.ipAddress || ''}`;
            computeSha256(rawAuditString).then(hash => {
                const hashEl = document.getElementById('auditHash');
                if (hashEl) hashEl.textContent = `sha256:${hash}`;
            }).catch(() => {
                const hashEl = document.getElementById('auditHash');
                if (hashEl) hashEl.textContent = `sha256:${(rawAuditString.length * 314159265).toString(16)}`;
            });

            if (p.signature.dataUrl) {
                document.getElementById('auditSignatureImg').src = p.signature.dataUrl;
            }
        }

        openSignModalBtn.disabled = true;
        openSignModalBtn.className = "flex-1 sm:flex-none bg-emerald-600/50 text-white text-xs font-semibold py-2.5 px-6 rounded-xl cursor-default opacity-80 flex items-center justify-center gap-2";
        openSignModalBtn.innerHTML = `
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>${dict.signBtnDone}</span>
        `;

        bottomBarTitle.textContent = dict.bottomBarTitleDone;
        bottomBarSubtitle.textContent = dict.bottomBarSubDone;

    } else {
        statusBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20";
        statusBadge.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>${dict.statusWaiting}</span>
        `;

        bottomBarTitle.textContent = dict.bottomBarTitleWait;
        bottomBarSubtitle.textContent = dict.bottomBarSubWait;
        openSignModalBtnText.textContent = dict.signBtnText;
    }
}

// =============================================================================
// FEATURE 3: PROPOSAL TRACKING & ACTIVE TIME SPENT ENGINE
// =============================================================================
function initTrackingEngine() {
    if (!proposalId || !securityToken) return;

    trackOpenEvent();
    startHeartbeat();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopHeartbeat();
            sendHeartbeatPing(accumulatedUnsentSeconds);
            accumulatedUnsentSeconds = 0;
        } else {
            activeSessionStartTime = Date.now();
            startHeartbeat();
        }
    });

    window.addEventListener('beforeunload', () => {
        if (accumulatedUnsentSeconds > 0) {
            const payload = JSON.stringify({
                token: securityToken,
                additionalSeconds: Math.round(accumulatedUnsentSeconds)
            });
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(`/api/proposals/${encodeURIComponent(proposalId)}/ping`, blob);
        }
    });
}

async function trackOpenEvent() {
    try {
        await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/track-open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: securityToken,
                device: navigator.userAgent
            })
        });
    } catch (e) {
        console.warn("Analytics Track Open fehlgeschlagen:", e);
    }
}

function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    activeSessionStartTime = Date.now();

    heartbeatTimer = setInterval(() => {
        if (!document.hidden) {
            const now = Date.now();
            const elapsedSeconds = Math.round((now - activeSessionStartTime) / 1000);
            activeSessionStartTime = now;

            accumulatedUnsentSeconds += elapsedSeconds;
            if (accumulatedUnsentSeconds >= 15) {
                sendHeartbeatPing(accumulatedUnsentSeconds);
                accumulatedUnsentSeconds = 0;
            }
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

async function sendHeartbeatPing(seconds) {
    if (seconds <= 0) return;
    try {
        await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: securityToken,
                additionalSeconds: seconds
            })
        });
    } catch (e) {
        console.warn("Heartbeat Ping fehlgeschlagen:", e);
    }
}

// =============================================================================
// E-SIGN & UI EVENTS
// =============================================================================
function bindViewEvents() {
    const openSignModalBtn = document.getElementById('openSignModalBtn');
    const closeSignModalBtn = document.getElementById('closeSignModalBtn');
    const cancelSignBtn = document.getElementById('cancelSignBtn');
    const clearCanvasBtn = document.getElementById('clearCanvasBtn');
    const signatureForm = document.getElementById('signatureForm');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');

    openSignModalBtn?.addEventListener('click', openSignatureModal);
    closeSignModalBtn?.addEventListener('click', closeSignatureModal);
    cancelSignBtn?.addEventListener('click', closeSignatureModal);
    
    clearCanvasBtn?.addEventListener('click', () => {
        if (signaturePad) signaturePad.clear();
    });

    signatureForm?.addEventListener('submit', handleSignatureSubmit);
    downloadPdfBtn?.addEventListener('click', handleDownloadPdf);
}

function setupSignaturePad() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        if (signaturePad) signaturePad.clear();
    }

    window.addEventListener("resize", resizeCanvas);
    
    setTimeout(() => {
        resizeCanvas();
        signaturePad = new SignaturePad(canvas, {
            penColor: '#0f172a',
            backgroundColor: 'rgb(255, 255, 255)',
            minWidth: 1.5,
            maxWidth: 3
        });
    }, 200);
}

function openSignatureModal() {
    if (currentProposal?.status === 'signed') return;

    const modal = document.getElementById('signatureModal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
        const canvas = document.getElementById('signatureCanvas');
        if (canvas && signaturePad) {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext("2d").scale(ratio, ratio);
            signaturePad.clear();
        }
    }, 10);
}

function closeSignatureModal() {
    const modal = document.getElementById('signatureModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function handleSignatureSubmit(e) {
    e.preventDefault();
    const lang = currentProposal?.language || 'de';
    const dict = viewI18n[lang] || viewI18n.de;

    if (!signaturePad || signaturePad.isEmpty()) {
        alert(dict.canvasEmptyAlert);
        return;
    }

    const signerName = document.getElementById('signerNameInput').value.trim();
    const signerRole = document.getElementById('signerRoleInput').value.trim();
    const signatureDataUrl = signaturePad.toDataURL('image/png');
    const submitBtn = document.getElementById('submitSignBtn');

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>${dict.signingInProgress}</span>`;

    try {
        const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: securityToken,
                signerName: signerName,
                signerRole: signerRole,
                signatureDataUrl: signatureDataUrl
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || "Signatur konnte nicht verarbeitet werden.");
        }

        const resData = await response.json();

        currentProposal.status = 'signed';
        currentProposal.signature = {
            signerName: signerName,
            signerRole: signerRole,
            signedAt: resData.signedAt || new Date().toISOString(),
            ipAddress: resData.ipAddress || 'Verifiziert',
            dataUrl: signatureDataUrl
        };

        closeSignatureModal();
        updateStatusUI(currentProposal);

        alert(dict.signSuccessAlert);

    } catch (err) {
        console.error("Signatur-Fehler:", err);
        alert("Fehler bei der Signatur: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>${dict.submitSignBtn}</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    }
}

async function handleDownloadPdf() {
    const downloadBtn = document.getElementById('downloadPdfBtn');
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `<div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div><span>PDF...</span>`;

    const element = document.getElementById('export-document');
    const clientName = (currentProposal?.clientName || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Proposal_${clientName}_Signed.pdf`;

    const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, windowWidth: 840 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
        await html2pdf().set(opt).from(element).save();
    } catch (err) {
        console.error("PDF Download Fehler:", err);
        alert("Fehler beim Herunterladen des PDFs.");
    } finally {
        const lang = currentProposal?.language || 'de';
        const dict = viewI18n[lang] || viewI18n.de;
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg><span id="downloadPdfBtnText">${dict.downloadPdf}</span>`;
    }
}

function showError(title, msg) {
    const errorBox = document.getElementById('errorBox');
    if (errorBox) {
        document.getElementById('errorTitle').textContent = title;
        document.getElementById('errorMessage').textContent = msg;
        errorBox.classList.remove('hidden');
    }
}

async function computeSha256(text) {
    if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.abs(text.split('').reduce((a, b) => { a = (a << 5) - a + b.charCodeAt(0); return a & a; }, 0)).toString(16).padStart(32, '0');
}
