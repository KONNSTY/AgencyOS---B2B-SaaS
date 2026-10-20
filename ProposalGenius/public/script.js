/**
 * AgencyOS - Hardened Zero-Trust Client Engine
 * Features:
 * - Smart Feature Gating (Logo-Upload & Quota Interception)
 * - Cryptographic Token Transmission (Authorization: Bearer <idToken>)
 * - Feature 1: E-Sign Proposal Publishing & Share Link Generator
 * - Feature 2: CRM & Zapier Integration (Outbound Webhooks: HubSpot, Pipedrive, Zapier, Make)
 * - Feature 3: Live Proposal Tracking (Views, Time Spent & Real-Time Pulse)
 * - Feature 4: Internationalization (i18n Multi-Language Engine: DE, EN, FR, ES)
 * - Feature 5: Template Library & Multi-Theme Design-System (Corporate, Minimalist, Creative)
 */

// =============================================================================
// 1. FIREBASE INITIALISIERUNG
// =============================================================================
// Die Firebase-Web-Konfiguration wird ausschließlich serverseitig aus der
// gemeinsamen Polymath-Umgebung in firebase-runtime-config.js erzeugt.
const firebaseConfig = window.firebaseConfig || null;

let auth = null;
let isFirebaseReady = false;

try {
    const isPlaceholderKey = !firebaseConfig?.apiKey;
    
    if (isPlaceholderKey) {
        console.warn("⚠️ [Firebase] Platzhalter-API-Key erkannt. Bitte füge deine echten Firebase-Web-App-Zugangsdaten in public/script.js oder public/index.html ein.");
    } else {
        if (typeof firebase !== 'undefined' && !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            auth = firebase.auth();
            isFirebaseReady = true;
            console.log("🔒 [Security] Firebase Client SDK erfolgreich initialisiert.");
        }
    }
} catch (error) {
    console.warn("⚠️ Firebase läuft im Fallback-Modus:", error.message);
}

// App & User State
let currentUser = null;
let currentUserProfile = {
    isPro: false,
    freeProposalsUsed: 0,
    freeProposalsUsedByDocType: {},
    agencyName: '',
    agencyEmail: '',
    agencyPhone: '',
    agencyAddress: '',
    logoUrl: '',
    webhookUrl: '',
    webhookEvents: ['proposal.signed']
};
let isProposalGenerated = false;
let activePublishedProposalId = null;

const defaultDocConfig = {
    proposal: {
        goalsLabel: "Projektziel & Stichpunkte",
        goalsPlaceholder: "- Moderner Relaunch der Unternehmens-Website\n- Lead-Generierung für Neukunden & Kontaktformular\n- SEO-Grundoptimierung & Pagespeed unter 1.2s\n- Responsive Design für Mobile & Tablet\n- CMS-Schulung für Mitarbeiter nach Go-Live",
        deliverablesLabel: "2. Leistungsumfang & Deliverables",
        deliverablesPlaceholder: "- Phase 1: Strategie, UX/UI Design & Wireframing\n- Phase 2: Technische Umsetzung, CMS & Pagespeed\n- Phase 3: SEO On-Page Optimierung & Conversion\n- Phase 4: Cross-Browser QA, Go-Live & Schulung",
        btnText: "Angebot mit KI generieren",
        category: "Webdesign & WordPress Relaunch",
        budget: "4.850 €",
        deadline: "ca. 4-6 Wochen"
    },
    briefing: {
        goalsLabel: "Briefing-Ziele & Anforderungen",
        goalsPlaceholder: "- Genaue Zielgruppendefinition (B2B Entscheider)\n- Probleme mit dem aktuellen System (schlechte Performance, kein CMS)\n- Erwartungen an das neue Design (clean, minimalistisch, edel)\n- Wichtige Integrationen (Newsletter, CRM)",
        deliverablesLabel: "2. Vorgesehene Arbeitsschritte / Analyse-Schwerpunkte",
        deliverablesPlaceholder: "- Phase 1: Strategie-Workshop & Zielgruppen-Interviews\n- Phase 2: Anforderungskatalog & User Personas\n- Phase 3: Technische Soll-Architektur & Systemauswahl\n- Phase 4: Abschlussbericht & Freigabe des Lastenhefts",
        btnText: "Briefing mit KI generieren",
        category: "Anforderungsanalyse & Briefing",
        budget: "1.200 €",
        deadline: "ca. 1-2 Wochen"
    },
    contract: {
        goalsLabel: "Vertragsklauseln & Besondere Vereinbarungen",
        goalsPlaceholder: "- Urheberrecht: Nutzungsrechte gehen nach vollständiger Zahlung an den Kunden über\n- Haftung: Maximal auf die Höhe des Auftragswerts begrenzt\n- Kündigungsfristen: 4 Wochen zum Monatsende\n- Mitwirkungspflichten des Kunden bezüglich Inhalten",
        deliverablesLabel: "2. Leistungsumfang & Vertragsbestandteile",
        deliverablesPlaceholder: "- SOW Phase 1: Konzeption & Design-Freigabe\n- SOW Phase 2: Web-Entwicklung & Code-Lieferung\n- SOW Phase 3: Migration & SSL-Einrichtung\n- SOW Phase 4: Abnahme-Protokoll & Projektabschluss",
        btnText: "Vertrag mit KI generieren",
        category: "Dienstleistungsvertrag (SOW)",
        budget: "3.500 €",
        deadline: "ca. 4 Wochen"
    },
    roadmap: {
        goalsLabel: "Kickoff-Ablauf & Kommunikationswege",
        goalsPlaceholder: "- Kickoff-Meeting: Festlegung der Ansprechpartner\n- Wöchentliche Status-Updates per E-Mail\n- Slack-Kanal für täglichen Austausch\n- Freigabefristen: Feedback innerhalb von 48 Stunden",
        deliverablesLabel: "2. Projekt-Meilensteine & Phasen",
        deliverablesPlaceholder: "- Meilenstein 1: Kickoff & Materialübergabe (Woche 1)\n- Meilenstein 2: UI/UX Konzept-Präsentation (Woche 2)\n- Meilenstein 3: Beta-Version zum Testen (Woche 4)\n- Meilenstein 4: Finaler Launch & Schulung (Woche 6)",
        btnText: "Roadmap mit KI generieren",
        category: "Kickoff-Roadmap & Onboarding",
        budget: "Nach Vereinbarung",
        deadline: "ca. 6 Wochen"
    },
    signoff: {
        goalsLabel: "Abnahmekriterien & Testergebnisse",
        goalsPlaceholder: "- Responsive-Layout auf iOS und Android erfolgreich getestet\n- Ladezeiten (LCP) liegen unter 1.5 Sekunden\n- CMS-Schulung für Redakteure durchgeführt\n- Keine kritischen Fehler in den Formularen vorhanden",
        deliverablesLabel: "2. Abgenommene Teilleistungen & Mängelliste",
        deliverablesPlaceholder: "- Leistungspaket 1: Webdesign & Frontend-Entwicklung (Abgenommen)\n- Leistungspaket 2: Kontaktformulare & CRM-Sync (Abgenommen)\n- Leistungspaket 3: SEO-Grundoptimierung (Abgenommen)\n- Restarbeiten: Optimierung der Bildgrößen bis Ende der Woche",
        btnText: "Abnahmeprotokoll mit KI generieren",
        category: "Abnahmeprotokoll & Übergabe",
        budget: "Pauschal abgenommen",
        deadline: new Date().toLocaleDateString('de-DE')
    },
    invoice: {
        goalsLabel: "Rechnungsdetails & Zahlungskonditionen",
        goalsPlaceholder: "- Zahlungsfrist: 14 Tage netto nach Rechnungserhalt\n- Skonto-Vereinbarung: 2% bei Zahlung innerhalb von 3 Tagen\n- Umsatzsteuer: Zuzüglich 19% MwSt.\n- Bankverbindung: DE89 1234 5678 9012 3456 78",
        deliverablesLabel: "2. Aufzuteilende Rechnungsposten",
        deliverablesPlaceholder: "- Posten 1: Website-Konzeption & UI/UX Design (1.500 €)\n- Posten 2: WordPress-Entwicklung & Programmierung (2.500 €)\n- Posten 3: Content-Migration & Texte (850 €)\n- Posten 4: Hosting-Einrichtung & Go-Live Support (500 €)",
        btnText: "Rechnung mit KI generieren",
        category: "Rechnung für Projektleistungen",
        budget: "5.350 €",
        deadline: "Fällig in 14 Tagen"
    }
};
let analyticsPollingTimer = null;
let selectedLanguage = 'de';
let selectedTone = 'professional';
let selectedTheme = 'modern-minimal';
let userProposalsList = [];

// =============================================================================
// 2. FEATURE 5: NICHE TEMPLATES PRESETS
// =============================================================================
const nichePresets = {
    webdesign: {
        category: "Webdesign & WordPress/Webflow Relaunch",
        clientName: "Schmidt & Partner Steuerberatung",
        budget: "4.850 €",
        deadline: "6 Wochen",
        goals: `- Vollständiger moderner Relaunch der Unternehmens-Website
- Zielgruppenoptimiertes UI/UX-Design für maximale Lead-Generierung
- Pagespeed unter 1.2s & Google Core Web Vitals Optimierung
- Responsive Design für alle Bildschirmgrößen (Mobile First)
- DSGVO-konforme Integration von Kontaktformularen & Cookie-Banner
- 1h CMS-Videoschulung für Mitarbeiter nach erfolgreichem Go-Live`,
        deliverables: `- Phase 1: UX/UI Design, Wireframing & Design-System
- Phase 2: Responsive Frontend & WordPress/Webflow CMS-Integration
- Phase 3: SEO OnPage-Setup, Pagespeed-Optimierung & Meta-Tags
- Phase 4: Cross-Browser QA, Go-Live & 1h Video-Schulung`
    },
    seo: {
        category: "SEO & Organische Sichtbarkeit",
        clientName: "Bavaria Logistics GmbH",
        budget: "2.400 € / Monat",
        deadline: "Laufend (6 Monate Laufzeit)",
        goals: `- Umfassendes technisches SEO-Audit & Behebung aller Crawling-Fehler
- Keyword- & Wettbewerber-Recherche für 50 High-Intent Suchbegriffe
- On-Page Optimierung aller bestehenden Leistungs- & Kategorieseiten
- Erstellung einer Content-Cluster Roadmap (4 suchmaschinenoptimierte Fachartikel/Monat)
- Kontinuierlicher Backlink-Aufbau von themenrelevanten Fachportalen
- Monatliches Live-Reporting & KPI-Dashboard`,
        deliverables: `- Phase 1: Technisches SEO-Audit & Crawl-Error Behebung
- Phase 2: Keyword-Strategie & Content-Cluster Roadmap
- Phase 3: On-Page & Meta-Optimierung der Kernseiten
- Phase 4: Backlink-Aufbau, Reporting & monatliche KPI-Reviews`
    },
    ecommerce: {
        category: "E-Commerce & Shopify Online-Shop",
        clientName: "Nordic Living Fashion",
        budget: "6.900 €",
        deadline: "8 Wochen",
        goals: `- Professionelles Shopify Plus Store Setup mit individuellem Branding
- Optimierter 1-Click Checkout & Integration aller Zahlungsarten (PayPal, Klarna, Kreditkarte, Apple Pay)
- Migration von 150 Produkten, Kollektionen & Kundendaten
- Automatisierte E-Mail Flows bei Warenkorbabbrüchen (Klaviyo Integration)
- Mobile-optimierte Produktseiten mit Sticky Add-to-Cart Button
- Rechtssichere Konfiguration (AGB, Widerruf, Impressum & DSGVO)`,
        deliverables: `- Phase 1: Shopify Plus Store-Architektur & UI/UX-Theme
- Phase 2: Checkout-Optimierung & Payment-Gateway Integration
- Phase 3: Produktmigration & automatisierte Klaviyo Abandoned-Cart Flows
- Phase 4: Rechtssicherheits-Check (DSGVO) & Store-Launch`
    },
    branding: {
        category: "Brand Identity & Corporate Design",
        clientName: "Aura Health & Care",
        budget: "3.200 €",
        deadline: "4 Wochen",
        goals: `- Entwicklung von 3 individuellen Logo-Konzepten inkl. Revisionen
- Definition der Markenfarbpalette (Hex, RGB, CMYK, Pantone) & Typografie
- Erstellung eines 20-seitigen Brand Guidelines Brandbooks (PDF)
- Social Media Starter-Kit (Templates für Instagram, LinkedIn, Banner)
- Gestaltung von Geschäftsausstattung (Visitenkarten, Briefpapier, E-Mail-Signatur)`,
        deliverables: `- Phase 1: Markenanalyse & 3 maßgeschneiderte Logo-Konzepte
- Phase 2: Farbpalette, Typografie-System & 20-seitiges Brandbook
- Phase 3: Geschäftsausstattung (Visitenkarten, Briefpapier, E-Mail-Signatur)
- Phase 4: Social Media Starter-Kit & finale Asset-Übergabe`
    },
    saas: {
        category: "Custom Web-App & SaaS MVP Entwicklung",
        clientName: "FleetFlow Software",
        budget: "9.500 €",
        deadline: "8-10 Wochen",
        goals: `- Konzeption der Systemarchitektur, Datenmodell & REST API Endpunkte
- Modernes Frontend mit Responsive Dashboard & Benutzerverwaltung
- Sichere Authentifizierung & rollenbasierte Zugriffsrechte (RBAC)
- Stripe Billing Integration für monatliche/jährliche Abonnements
- Automatisierte Transaktions-E-Mails & PDF-Rechnungserstellung
- Cloud Deployment auf AWS/Vercel inkl. CI/CD Pipeline & Monitoring`,
        deliverables: `- Phase 1: Architektur-Konzept, Datenmodell & REST API Design
- Phase 2: Responsive Frontend Dashboard & RBAC-Authentifizierung
- Phase 3: Stripe Billing Integration & automatische Rechnungsstellung
- Phase 4: Cloud Deployment (AWS/Vercel), CI/CD Pipeline & Live-Handover`
    }
};

// =============================================================================
// 3. DOMContentLoaded & INITIALISIERUNG
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initDefaults();
    initDsgvoBanner();
    bindThemeEvents();
    bindLanguageEvents();
    bindFormEvents();
    bindUnlockAuthEvents();
    bindProfileEvents();
    bindPrivacyEvents();
    bindPaywallEvents();
    bindESignShareEvents();
    bindTrackingEvents();
    bindCrmModalEvents();
    bindDashboardModalEvents();
    bindDealScoreEvents();
    checkUrlParameters();
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

function initDefaults() {
    updateDocumentLanguageLabels(selectedLanguage);
    applyThemeToDocument(selectedTheme);
    
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const today = new Date();
    document.getElementById('docNumber').textContent = `AOS-${today.getFullYear()}-${randomNum}`;

    previousDocType = 'proposal';
    handleDocumentTypeChange();

    updateLivePreview();

    if (isFirebaseReady) {
        auth.onAuthStateChanged(handleAuthStateChange);
    }
}

// =============================================================================
// 4. FEATURE 5: 18-THEME LIBRARY & NICHE PRESETS HANDLER
// =============================================================================
const THEME_DEFINITIONS = [
    // 3 Free Themes
    {
        id: 'modern-minimal',
        name: 'Modern Minimal',
        tag: 'Freelancer & General',
        isPro: false,
        icon: '⚪',
        preview: ['#ffffff', '#f8fafc', '#0f172a'],
        desc: 'Clean white space, dark slate typography & subtle borders'
    },
    {
        id: 'tech-stark',
        name: 'Tech Stark',
        tag: 'IT & Software Devs',
        isPro: false,
        icon: '⚡',
        preview: ['#ffffff', '#0f172a', '#0284c7'],
        desc: 'Deep slate/navy accents, sharp lines & modern code structure'
    },
    {
        id: 'creative-bold',
        name: 'Creative Bold',
        tag: 'Design & Marketing',
        isPro: false,
        icon: '🎨',
        preview: ['#fffdfa', '#ea580c', '#e11d48'],
        desc: 'Warm undertones, vibrant gradients & expressive headings'
    },

    // 15 Pro Themes (Gated behind Pro status)
    {
        id: 'executive-corporate',
        name: 'Executive Corporate',
        tag: 'Kanzleien & Großkunden',
        isPro: true,
        icon: '🏛️',
        preview: ['#0a192f', '#1e3a8a', '#d97706'],
        desc: 'Klassische Serif-Typografie, Royal Navy & warme Gold-Highlights'
    },
    {
        id: 'startup-vibrant',
        name: 'Startup Vibrant',
        tag: 'SaaS & Scaleups',
        isPro: true,
        icon: '🚀',
        preview: ['#6366f1', '#06b6d4', '#ec4899'],
        desc: 'Moderne Tech-Gradients, lebendige Cards & High-Growth-Vibe'
    },
    {
        id: 'luxury-gold',
        name: 'Luxury Gold',
        tag: 'High-Ticket & VIP',
        isPro: true,
        icon: '👑',
        preview: ['#09090b', '#d4af37', '#fef08a'],
        desc: 'Edler Dark-Modus, Champagner-Gold & Cinzel-Schriftart'
    },
    {
        id: 'eco-sustainable',
        name: 'Eco Sustainable',
        tag: 'Green-Tech & Bio',
        isPro: true,
        icon: '🌿',
        preview: ['#f7f9f6', '#14532d', '#15803d'],
        desc: 'Sanfte Natur- und Waldtöne mit organischer Haptik'
    },
    {
        id: 'architectural-grid',
        name: 'Architectural Grid',
        tag: 'Architektur & Ingenieure',
        isPro: true,
        icon: '📐',
        preview: ['#f8fafc', '#0284c7', '#334155'],
        desc: 'Bauplan-Gitterstruktur, präzise Tabellen & Monospace-Details'
    },
    {
        id: 'bold-agency',
        name: 'Bold Agency',
        tag: 'Kreativ- & Werbeagenturen',
        isPro: true,
        icon: '💥',
        preview: ['#000000', '#facc15', '#ffffff'],
        desc: 'Ultra-starker Kontrast, leuchtendes Gelb & asymmetrische Akzente'
    },
    {
        id: 'financial-trust',
        name: 'Financial Trust',
        tag: 'Fintech & Vermögensberatung',
        isPro: true,
        icon: '🛡️',
        preview: ['#064e3b', '#059669', '#1e293b'],
        desc: 'Smaragdgrün & Deep Slate für maximale Seriosität und Vertrauen'
    },
    {
        id: 'creative-dark',
        name: 'Creative Dark',
        tag: 'Digital Labs & Web3',
        isPro: true,
        icon: '🌌',
        preview: ['#020617', '#10b981', '#38bdf8'],
        desc: 'Tiefdunkler Hintergrund mit fluoreszierenden Smaragd-Akzenten'
    },
    {
        id: 'minimal-warmth',
        name: 'Minimal Warmth',
        tag: 'Coaching & Consulting',
        isPro: true,
        icon: '☕',
        preview: ['#fdfbf7', '#c2410c', '#9a3412'],
        desc: 'Warme Sand- und Terrakotta-Farben mit harmonischer Typografie'
    },
    {
        id: 'cyber-security',
        name: 'Cyber Security',
        tag: 'Infosec & Cloud IT',
        isPro: true,
        icon: '🔒',
        preview: ['#050505', '#22c55e', '#06b6d4'],
        desc: 'Matrix-Terminal-Stil, Terminal-Grün und JetBrains Mono'
    },
    {
        id: 'consulting-pro',
        name: 'Consulting Pro',
        tag: 'Strategieberater & Big4',
        isPro: true,
        icon: '📊',
        preview: ['#172554', '#2563eb', '#64748b'],
        desc: 'Strukturierte Business-Matrix mit klaren KPI-Hierarchien'
    },
    {
        id: 'ecommerce-growth',
        name: 'E-Commerce Growth',
        tag: 'Shopify & Performance Ads',
        isPro: true,
        icon: '🛍️',
        preview: ['#ffffff', '#f97316', '#10b981'],
        desc: 'Conversion-optimierte Preistabellen & auffällige ROI-Callouts'
    },
    {
        id: 'editorial-magazine',
        name: 'Editorial Magazine',
        tag: 'PR, Mode & Medien',
        isPro: true,
        icon: '📰',
        preview: ['#ffffff', '#1c1917', '#78716c'],
        desc: 'Stilvolles Magazin-Editorial-Layout mit feinen Trennlinien'
    },
    {
        id: 'neon-punch',
        name: 'Neon Punch',
        tag: 'Next-Gen Agenturen',
        isPro: true,
        icon: '⚡',
        preview: ['#090d16', '#ec4899', '#8b5cf6'],
        desc: 'Dark Canvas mit leuchtendem Cyber-Pink und Violett-Farbverläufen'
    },
    {
        id: 'simple-mono',
        name: 'Simple Mono',
        tag: 'Indie Hacker & Coder',
        isPro: true,
        icon: '⌨️',
        preview: ['#fbfbfa', '#18181b', '#dc2626'],
        desc: 'Puristischer Schreibmaschinen- und Monospace-Look mit roten Akzenten'
    }
];

let currentThemeFilter = 'all';

function renderThemeGrid(filter = currentThemeFilter) {
    currentThemeFilter = filter;
    const gridContainer = document.getElementById('themeGridContainer');
    if (!gridContainer) return;

    const isUserPro = currentUserProfile && currentUserProfile.isPro === true;
    
    // Filter definitions
    let filteredThemes = THEME_DEFINITIONS;
    if (filter === 'free') {
        filteredThemes = THEME_DEFINITIONS.filter(t => !t.isPro);
    } else if (filter === 'pro') {
        filteredThemes = THEME_DEFINITIONS.filter(t => t.isPro);
    }

    gridContainer.innerHTML = '';

    filteredThemes.forEach(theme => {
        const isSelected = selectedTheme === theme.id;
        const isLocked = theme.isPro && !isUserPro;

        const card = document.createElement('button');
        card.type = 'button';
        card.setAttribute('data-theme-id', theme.id);
        
        let borderAndBg = isSelected 
            ? 'bg-slate-800/95 border-blue-500 ring-2 ring-blue-500/80 shadow-md shadow-blue-500/10' 
            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60';
        
        if (isSelected && theme.isPro) {
            borderAndBg = 'bg-slate-800/95 border-amber-500 ring-2 ring-amber-500/80 shadow-md shadow-amber-500/10';
        }

        card.className = `group relative text-left p-2.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${borderAndBg}`;

        // Color preview swatches
        const swatchHtml = theme.preview.map(c => 
            `<span class="w-2.5 h-2.5 rounded-full border border-black/20 shadow-xs inline-block" style="background-color: ${c};"></span>`
        ).join('');

        // Pro or Free Badge
        let badgeHtml = '';
        if (theme.isPro) {
            badgeHtml = `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                <span>👑</span> PRO
            </span>`;
        } else {
            badgeHtml = `<span class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                FREE
            </span>`;
        }

        // Lock icon badge if locked
        let lockOverlayHtml = '';
        if (isLocked) {
            lockOverlayHtml = `
                <div class="absolute top-2 right-2 text-xs bg-slate-950/80 text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-500/30 flex items-center gap-1 shadow-sm">
                    <span>🔒</span> <span class="text-[9px] font-bold">PRO</span>
                </div>
            `;
        }

        // Active Checkmark badge
        let activeCheckmarkHtml = '';
        if (isSelected) {
            activeCheckmarkHtml = `
                <div class="absolute top-2 right-2 text-xs ${theme.isPro ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 text-white'} w-4 h-4 rounded-full flex items-center justify-center font-black shadow-sm">
                    ✓
                </div>
            `;
        }

        card.innerHTML = `
            ${isLocked ? lockOverlayHtml : activeCheckmarkHtml}
            <div class="flex items-start justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-1.5 pr-6">
                    <span class="text-sm">${theme.icon}</span>
                    <span class="text-xs font-bold text-slate-100 truncate">${theme.name}</span>
                </div>
            </div>
            
            <p class="text-[10px] text-slate-400 mb-2 line-clamp-1">${theme.tag}</p>

            <div class="flex items-center justify-between pt-1 border-t border-slate-800/80 mt-auto">
                <div class="flex items-center gap-1">
                    ${swatchHtml}
                </div>
                ${!isLocked && !isSelected ? badgeHtml : ''}
            </div>
        `;

        card.addEventListener('click', () => {
            if (theme.isPro && !isUserPro) {
                showPaywallModal(
                    "👑 Pro-Design freischalten",
                    `Das Theme "${theme.name}" (${theme.tag}) ist exklusiv für Pro-Mitglieder verfügbar. Schalte jetzt alle 18 Designer-Vorlagen frei, um deine Abschlussquoten drastisch zu steigern!`
                );
                return;
            }
            selectTheme(theme.id);
        });

        gridContainer.appendChild(card);
    });
}

function selectTheme(themeId) {
    const themeDef = THEME_DEFINITIONS.find(t => t.id === themeId);
    if (!themeDef) return;

    selectedTheme = themeId;

    // Update Dropdown value
    const dropdown = document.getElementById('themeSelectDropdown');
    if (dropdown) dropdown.value = themeId;

    // Update Active Badge
    const badge = document.getElementById('activeThemeBadge');
    if (badge) badge.textContent = themeDef.name;

    // Re-render visual cards to highlight active one
    renderThemeGrid();

    // Apply classes to Document
    applyThemeToDocument(themeId);
}

function bindThemeEvents() {
    // 1. Dropdown Selection Handler
    const dropdown = document.getElementById('themeSelectDropdown');
    dropdown?.addEventListener('change', (e) => {
        const themeId = e.target.value;
        const themeDef = THEME_DEFINITIONS.find(t => t.id === themeId);
        const isUserPro = currentUserProfile && currentUserProfile.isPro === true;

        if (themeDef && themeDef.isPro && !isUserPro) {
            e.target.value = selectedTheme; // Revert
            showPaywallModal(
                "👑 Pro-Design freischalten",
                `Das Theme "${themeDef.name}" ist exklusiv für Pro-Abonnenten verfügbar. Erhalte sofortigen Zugriff auf alle 18 High-Converting Designs!`
            );
            return;
        }

        selectTheme(themeId);
    });

    // 2. Filter Buttons Handler
    const filterAll = document.getElementById('themeFilterAll');
    const filterFree = document.getElementById('themeFilterFree');
    const filterPro = document.getElementById('themeFilterPro');

    const updateFilterBtnStyles = (activeBtn) => {
        [filterAll, filterFree, filterPro].forEach(btn => {
            if (!btn) return;
            btn.className = "theme-filter-btn flex-1 py-1 px-2 rounded-lg font-semibold text-slate-400 hover:text-white transition-all text-center";
        });
        if (activeBtn === filterPro) {
            activeBtn.className = "theme-filter-btn flex-1 py-1 px-2 rounded-lg font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 transition-all text-center flex items-center justify-center gap-1";
        } else if (activeBtn) {
            activeBtn.className = "theme-filter-btn flex-1 py-1 px-2 rounded-lg font-semibold bg-blue-600 text-white transition-all text-center";
        }
    };

    filterAll?.addEventListener('click', () => {
        updateFilterBtnStyles(filterAll);
        renderThemeGrid('all');
    });

    filterFree?.addEventListener('click', () => {
        updateFilterBtnStyles(filterFree);
        renderThemeGrid('free');
    });

    filterPro?.addEventListener('click', () => {
        updateFilterBtnStyles(filterPro);
        renderThemeGrid('pro');
    });

    // 3. Initial Render & Theme Application
    renderThemeGrid('all');
    applyThemeToDocument(selectedTheme);

    // 4. Niche Preset Selector
    const presetSelect = document.getElementById('nichePresetSelect');
    presetSelect?.addEventListener('change', (e) => {
        const presetKey = e.target.value;
        if (!presetKey || !nichePresets[presetKey]) return;

        const preset = nichePresets[presetKey];
        document.getElementById('projectCategory').value = preset.category;
        document.getElementById('projectGoals').value = preset.goals;
        if (document.getElementById('projectDeliverables')) {
            document.getElementById('projectDeliverables').value = preset.deliverables || '';
        }
        document.getElementById('projectBudget').value = preset.budget;
        document.getElementById('projectDeadline').value = preset.deadline;
        
        if (!document.getElementById('clientName').value.trim()) {
            document.getElementById('clientName').value = preset.clientName;
        }

        updateLivePreview();

        // Optional sofort mit KI generieren falls noch nicht geschehen
        if (!isProposalGenerated) {
            handleGenerateProposal();
        }
    });
}

function applyThemeToDocument(theme) {
    const doc = document.getElementById('export-document');
    if (!doc) return;

    // Remove all possible theme classes
    const allThemes = [
        'modern-minimal', 'tech-stark', 'creative-bold',
        'executive-corporate', 'startup-vibrant', 'luxury-gold',
        'eco-sustainable', 'architectural-grid', 'bold-agency',
        'financial-trust', 'creative-dark', 'minimal-warmth',
        'cyber-security', 'consulting-pro', 'ecommerce-growth',
        'editorial-magazine', 'neon-punch', 'simple-mono',
        'corporate', 'minimalist', 'creative'
    ];
    allThemes.forEach(t => doc.classList.remove(`theme-${t}`));

    // Normalize legacy aliases
    let resolvedTheme = theme;
    if (theme === 'corporate' || theme === 'minimalist') resolvedTheme = 'modern-minimal';
    if (theme === 'creative') resolvedTheme = 'creative-bold';

    doc.classList.add(`theme-${resolvedTheme}`);
}

// =============================================================================
// 5. FEATURE 4: i18n MULTI-LANGUAGE ENGINE
// =============================================================================
const i18nDictionary = {
    de: {
        badgeText: "Projektangebot",
        dateLabel: "Datum:",
        numberLabel: "Angebots-Nr.:",
        clientLabel: "Erstellt für den Kunden",
        categoryLabel: "Projekt",
        timelineLabel: "Umsetzungszeitraum / Timeline",
        budgetLabel: "Gesamtinvestition (Netto)",
        validityLabel: "Gültigkeit: 14 Tage ab Angebotsdatum",
        locale: "de-DE",
        defaultDeadline: "ca. 4-6 Wochen",
        defaultBudget: "4.850 €",
        defaultDocHeading: "Angebot: Konzept, Entwicklung & Umsetzung",
        exportBtnText: "PDF herunterladen"
    },
    en: {
        badgeText: "Commercial Proposal",
        dateLabel: "Date:",
        numberLabel: "Proposal No.:",
        clientLabel: "Prepared for Client",
        categoryLabel: "Project Scope",
        timelineLabel: "Execution Timeline",
        budgetLabel: "Total Investment (Net)",
        validityLabel: "Validity: 14 days from proposal issue date",
        locale: "en-US",
        defaultDeadline: "approx. 4-6 weeks",
        defaultBudget: "$4,850 / 4,850 €",
        defaultDocHeading: "Proposal: Strategy, Development & Execution",
        exportBtnText: "Download PDF"
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
        locale: "fr-FR",
        defaultDeadline: "env. 4 à 6 semaines",
        defaultBudget: "4 850 €",
        defaultDocHeading: "Proposition : Stratégie, Conception & Réalisation",
        exportBtnText: "Télécharger le PDF"
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
        locale: "es-ES",
        defaultDeadline: "aprox. 4-6 semanas",
        defaultBudget: "4.850 €",
        defaultDocHeading: "Propuesta: Estrategia, Desarrollo & Ejecución",
        exportBtnText: "Descargar PDF"
    }
};

function bindLanguageEvents() {
    const langSelect = document.getElementById('proposalLanguageSelect');
    const toneSelect = document.getElementById('proposalToneSelect');
    const langBtns = document.querySelectorAll('#languageSelectorContainer .lang-btn');

    // Language Dropdown Event
    langSelect?.addEventListener('change', (e) => {
        const chosenLang = e.target.value;
        if (chosenLang === selectedLanguage) return;

        selectedLanguage = chosenLang;
        updateDocumentLanguageLabels(selectedLanguage);

        if (isProposalGenerated) {
            handleGenerateProposal();
        }
    });

    // Tone of Voice Dropdown Event
    toneSelect?.addEventListener('change', (e) => {
        selectedTone = e.target.value;
        if (isProposalGenerated) {
            handleGenerateProposal();
        }
    });

    // Language Quick-Buttons Event
    langBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chosenLang = btn.getAttribute('data-lang');
            if (chosenLang === selectedLanguage) return;

            selectedLanguage = chosenLang;
            if (langSelect) langSelect.value = chosenLang;

            // Button Styling
            langBtns.forEach(b => {
                b.className = "lang-btn py-1.5 px-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all text-center flex items-center justify-center gap-1";
            });
            btn.className = "lang-btn py-1.5 px-2 rounded-lg text-xs font-semibold bg-blue-600 text-white shadow-sm transition-all text-center flex items-center justify-center gap-1";

            updateDocumentLanguageLabels(selectedLanguage);

            // Re-render proposal content if already generated
            if (isProposalGenerated) {
                handleGenerateProposal();
            }
        });
    });
}

function updateDocumentLanguageLabels(lang) {
    const dict = i18nDictionary[lang] || i18nDictionary.de;
    
    document.getElementById('docBadgeText').textContent = dict.badgeText;
    document.getElementById('docDateLabel').textContent = dict.dateLabel;
    document.getElementById('docNumberLabel').textContent = dict.numberLabel;
    document.getElementById('docClientLabel').textContent = dict.clientLabel;
    document.getElementById('docCategoryLabel').textContent = dict.categoryLabel;
    document.getElementById('docTimelineLabel').textContent = dict.timelineLabel;
    document.getElementById('docBudgetLabel').textContent = dict.budgetLabel;
    document.getElementById('docValidityLabel').textContent = dict.validityLabel;
    document.getElementById('exportPdfBtnText').textContent = dict.exportBtnText;

    const today = new Date();
    document.getElementById('docDate').textContent = today.toLocaleDateString(dict.locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// =============================================================================
// 6. ZERO-TRUST TOKEN & AUTH HEADERS HELPER
// =============================================================================
async function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (currentUser && isFirebaseReady) {
        try {
            const idToken = await currentUser.getIdToken();
            headers['Authorization'] = `Bearer ${idToken}`;
        } catch (error) {
            console.warn("Konnte Auth-Token nicht generieren:", error);
        }
    }
    return headers;
}

// =============================================================================
// 7. AUTH STATE & SECURE PROFILE LOADING
// =============================================================================
async function handleAuthStateChange(user) {
    const guestControls = document.getElementById('guestControls');
    const userControls = document.getElementById('userControls');
    const userEmailNav = document.getElementById('userEmailNav');
    const docBlurWrapper = document.getElementById('documentBlurWrapper');
    const unlockOverlay = document.getElementById('unlockOverlay');

    if (user) {
        currentUser = user;
        guestControls.classList.add('hidden');
        userControls.classList.remove('hidden');
        userEmailNav.textContent = user.email;

        docBlurWrapper.classList.remove('doc-blurred');
        unlockOverlay.classList.add('opacity-0');
        setTimeout(() => unlockOverlay.classList.add('hidden'), 300);

        await loadUserData(user.uid);
        loadUserProposals();
    } else {
        currentUser = null;
        guestControls.classList.remove('hidden');
        userControls.classList.add('hidden');
        currentUserProfile = {
            isPro: false,
            freeProposalsUsed: 0,
            agencyName: '',
            agencyEmail: '',
            logoUrl: '',
            webhookUrl: '',
            webhookEvents: ['proposal.signed']
        };
        const countBadge = document.getElementById('dashboardCountBadge');
        if (countBadge) countBadge.classList.add('hidden');
        updatePlanBadge();
    }
}

async function loadUserData(uid) {
    if (!isFirebaseReady || !uid) return;

    try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/user/profile', { headers });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || result.error || 'Profil konnte nicht geladen werden.');
        }

        currentUserProfile = {
            freeProposalsUsedByDocType: {},
            ...currentUserProfile,
            ...(result.profile || {})
        };

        applyProfileToUI();
    } catch (error) {
        console.error("Fehler beim Laden des Profils:", error);
    }
}

function applyProfileToUI() {
    if (currentUserProfile.agencyName) {
        document.getElementById('agencyName').value = currentUserProfile.agencyName;
        document.getElementById('docAgency').textContent = currentUserProfile.agencyName;
    }
    if (currentUserProfile.agencyEmail) {
        document.getElementById('agencyEmail').value = currentUserProfile.agencyEmail;
        document.getElementById('docEmail').textContent = currentUserProfile.agencyEmail;
    }

    if (currentUserProfile.logoUrl) {
        const docLogo = document.getElementById('docLogo');
        docLogo.src = currentUserProfile.logoUrl;
        docLogo.classList.remove('hidden');
        
        const logoUploadText = document.getElementById('logoUploadText');
        if (logoUploadText) {
            logoUploadText.textContent = "Logo aktiv (Ändern)";
        }
    }

    updatePlanBadge();
}

function updatePlanBadge() {
    const planBadge = document.getElementById('planBadge');
    const planBadgeText = document.getElementById('planBadgeText');
    const upgradeHeaderBtn = document.getElementById('upgradeHeaderBtn');
    
    const docTypeVal = document.getElementById('documentTypeSelect')?.value || 'proposal';
    const docTypeNames = {
        proposal: 'Angebot',
        briefing: 'Briefing',
        contract: 'Vertrag',
        roadmap: 'Roadmap',
        signoff: 'Abnahme',
        invoice: 'Rechnung'
    };
    const currentName = docTypeNames[docTypeVal] || 'Angebot';

    if (!currentUser) {
        planBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700";
        planBadgeText.textContent = `Gast-Modus (1 ${currentName} frei)`;
        upgradeHeaderBtn?.classList.add('hidden');
        renderThemeGrid();
        return;
    }

    if (currentUserProfile.isPro) {
        planBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30";
        planBadgeText.innerHTML = `★ PRO-PLAN AKTIV`;
        upgradeHeaderBtn?.classList.add('hidden');
    } else {
        const docTypeUsage = currentUserProfile.freeProposalsUsedByDocType || {};
        const used = docTypeUsage[docTypeVal] || 0;
        if (used >= 1) {
            planBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20";
            planBadgeText.textContent = `${currentName} Limit erreicht (0/1 frei)`;
        } else {
            planBadge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20";
            planBadgeText.textContent = `Free Plan (1 ${currentName} frei)`;
        }
        upgradeHeaderBtn?.classList.remove('hidden');
    }

    renderThemeGrid();
    updateWatermark();
}

function updateWatermark() {
    const watermark = document.getElementById('agencyOsWatermark');
    if (!watermark) return;
    
    const isPro = currentUserProfile?.isPro === true;
    const hideBranding = currentUserProfile?.hideBranding === true;
    
    if (isPro && hideBranding) {
        watermark.classList.add('hidden');
    } else {
        watermark.classList.remove('hidden');
        if (!isPro) {
            watermark.innerHTML = `Erstellt mit der Free-Version von <span class="text-blue-500 font-bold ml-1">AgencyOS</span>`;
            watermark.classList.add('cursor-pointer', 'hover:text-blue-500');
            watermark.onclick = () => {
                const paywall = document.getElementById('paywallModal');
                if (paywall) {
                    paywall.classList.remove('hidden');
                    setTimeout(() => paywall.classList.remove('opacity-0'), 10);
                }
            };
        } else {
            watermark.innerHTML = `Erstellt mit AgencyOS`;
            watermark.classList.remove('cursor-pointer', 'hover:text-blue-500');
            watermark.onclick = null;
        }
    }
}

let previousDocType = 'proposal';

function handleDocumentTypeChange() {
    const docTypeVal = document.getElementById('documentTypeSelect')?.value || 'proposal';
    
    // 1. Get configs for current and previous types
    const prevConfig = defaultDocConfig[previousDocType] || defaultDocConfig.proposal;
    const currentConfig = defaultDocConfig[docTypeVal] || defaultDocConfig.proposal;
    
    // Update labels
    const goalsLabel = document.getElementById('projectGoalsLabel');
    if (goalsLabel) goalsLabel.textContent = currentConfig.goalsLabel;
    
    const deliverablesLabel = document.getElementById('projectDeliverablesLabel');
    if (deliverablesLabel) deliverablesLabel.textContent = currentConfig.deliverablesLabel;
    
    // Update button text
    const generateBtnText = document.querySelector('#generateBtn span');
    if (generateBtnText) generateBtnText.textContent = currentConfig.btnText;
    
    // Update goals value and placeholder
    const goalsInput = document.getElementById('projectGoals');
    if (goalsInput) {
        goalsInput.placeholder = currentConfig.goalsPlaceholder;
        // Only overwrite current value if it is empty or matches the previous default value
        const currentGoalsVal = goalsInput.value.trim();
        if (currentGoalsVal === '' || currentGoalsVal === prevConfig.goalsPlaceholder.trim()) {
            goalsInput.value = currentConfig.goalsPlaceholder;
        }
    }
    
    // Update deliverables value and placeholder
    const deliverablesInput = document.getElementById('projectDeliverables');
    if (deliverablesInput) {
        deliverablesInput.placeholder = currentConfig.deliverablesPlaceholder;
        const currentDeliverablesVal = deliverablesInput.value.trim();
        if (currentDeliverablesVal === '' || currentDeliverablesVal === prevConfig.deliverablesPlaceholder.trim()) {
            deliverablesInput.value = currentConfig.deliverablesPlaceholder;
        }
    }
    
    // Update category
    const categoryInput = document.getElementById('projectCategory');
    if (categoryInput) {
        const currentCategoryVal = categoryInput.value.trim();
        if (currentCategoryVal === '' || currentCategoryVal === prevConfig.category.trim()) {
            categoryInput.value = currentConfig.category;
        }
    }
    
    // Update budget
    const budgetInput = document.getElementById('projectBudget');
    if (budgetInput) {
        const currentBudgetVal = budgetInput.value.trim();
        if (currentBudgetVal === '' || currentBudgetVal === prevConfig.budget.trim()) {
            budgetInput.value = currentConfig.budget;
        }
    }
    
    // Update deadline
    const deadlineInput = document.getElementById('projectDeadline');
    if (deadlineInput) {
        const currentDeadlineVal = deadlineInput.value.trim();
        if (currentDeadlineVal === '' || currentDeadlineVal === prevConfig.deadline.trim()) {
            deadlineInput.value = currentConfig.deadline;
        }
    }
    
    // 2. Keep track of docType for the next switch
    previousDocType = docTypeVal;
    
    // 3. Update plan badge to show type-specific limits
    updatePlanBadge();
    
    // 4. Force preview update
    updateLivePreview();
}

// =============================================================================
// 8. FORMULAR & LIVE-PREVIEW EVENT HANDLING
// =============================================================================
function bindFormEvents() {
    const inputs = [
        'agencyName',
        'agencyEmail',
        'clientName',
        'projectCategory',
        'projectGoals',
        'projectDeliverables',
        'projectBudget',
        'projectDeadline'
    ];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateLivePreview);
            el.addEventListener('change', updateLivePreview);
        }
    });

    const documentTypeSelect = document.getElementById('documentTypeSelect');
    if (documentTypeSelect) {
        documentTypeSelect.addEventListener('change', handleDocumentTypeChange);
    }

    const uploadLogoBtn = document.getElementById('uploadLogoBtn');
    const logoInput = document.getElementById('logoInput');
    
    uploadLogoBtn.addEventListener('click', () => {
        if (!currentUser) {
            showUnlockOverlay(true);
            return;
        }

        if (!currentUserProfile.isPro) {
            showPaywallModal(
                "Custom Branding is a Pro feature",
                "Das Hinzufügen deines eigenen Firmenlogos und individuellen Brandings ist exklusiv für Pro-Abonnenten verfügbar. Upgrade auf Pro (29€/Monat), um deine Angebote professionell mit eigenem Branding zu versehen."
            );
            return;
        }

        logoInput.click();
    });

    logoInput.addEventListener('change', handleLogoUpload);

    const enableRoiCalc = document.getElementById('enableRoiCalc');
    const roiCalcConfigSection = document.getElementById('roiCalcConfigSection');
    enableRoiCalc?.addEventListener('change', (e) => {
        if (e.target.checked) {
            roiCalcConfigSection?.classList.remove('hidden');
        } else {
            roiCalcConfigSection?.classList.add('hidden');
        }
    });

    document.getElementById('generateBtn').addEventListener('click', handleGenerateProposal);
    document.getElementById('exportBtn').addEventListener('click', handlePDFExport);
    document.getElementById('resetDocBtn').addEventListener('click', resetDocument);

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (isFirebaseReady) await auth.signOut();
    });

    document.getElementById('openAuthModalBtn').addEventListener('click', () => showUnlockOverlay(false));
}

function updateLivePreview() {
    const dict = i18nDictionary[selectedLanguage] || i18nDictionary.de;
    const agency = document.getElementById('agencyName')?.value.trim() || 'Deine Agentur';
    const email = document.getElementById('agencyEmail')?.value.trim() || 'kontakt@agentur.de';
    const client = document.getElementById('clientName')?.value.trim() || 'Schmidt & Partner';
    const budget = document.getElementById('projectBudget')?.value.trim() || dict.defaultBudget;
    const deadline = document.getElementById('projectDeadline')?.value.trim() || dict.defaultDeadline;
    const category = document.getElementById('projectCategory')?.value.trim() || 'Webdesign & WordPress Relaunch';
    const goals = document.getElementById('projectGoals')?.value.trim() || '';
    const deliverables = document.getElementById('projectDeliverables')?.value.trim() || '';

    const docAgency = document.getElementById('docAgency');
    const docEmail = document.getElementById('docEmail');
    const docClient = document.getElementById('docClient');
    const docBudget = document.getElementById('docBudget');
    const docDeadline = document.getElementById('docDeadline');
    const docCategory = document.getElementById('docCategory');
    const docHeading = document.getElementById('docHeading');

    if (docAgency) docAgency.textContent = agency;
    if (docEmail) docEmail.textContent = email;
    if (docClient) docClient.textContent = client;
    if (docBudget) docBudget.textContent = budget;
    if (docDeadline) docDeadline.textContent = deadline;
    if (docCategory) docCategory.textContent = category;

    const headingPrefix = selectedLanguage === 'en' ? 'Proposal' : (selectedLanguage === 'fr' ? 'Proposition' : (selectedLanguage === 'es' ? 'Propuesta' : 'Angebot'));
    if (docHeading) docHeading.textContent = `${headingPrefix}: ${category}`;

    if (!isProposalGenerated) {
        const aiTextEl = document.getElementById('aiTextContent');
        if (aiTextEl) {
            aiTextEl.innerHTML = buildLocalI18nProposalTemplate(
                selectedLanguage,
                client,
                goals || "- Moderner Relaunch der Unternehmens-Website\n- Lead-Generierung für Neukunden & Kontaktformular\n- SEO-Grundoptimierung & Pagespeed\n- Responsive Design für Mobile & Tablet",
                category,
                budget,
                deadline,
                agency,
                deliverables || "- Phase 1: Strategie, UX/UI Design & Wireframing\n- Phase 2: Technische Umsetzung & CMS\n- Phase 3: SEO On-Page Optimierung\n- Phase 4: QA, Go-Live & Übergabe"
            );
        }
    }
    
    updateWatermark();
}

// =============================================================================
// 9. FEATURE 4: i18n KI GENERATOR
// =============================================================================
async function handleGenerateProposal() {
    const dict = i18nDictionary[selectedLanguage] || i18nDictionary.de;
    const client = document.getElementById('clientName').value.trim();
    const goals = document.getElementById('projectGoals').value.trim();
    const deliverables = document.getElementById('projectDeliverables')?.value.trim() || '';
    const category = document.getElementById('projectCategory').value.trim() || 'Webdesign & WordPress Relaunch';
    const budget = document.getElementById('projectBudget').value.trim() || dict.defaultBudget;
    const deadline = document.getElementById('projectDeadline').value.trim() || dict.defaultDeadline;
    const agency = document.getElementById('agencyName').value.trim() || 'Unsere Agentur';
    const agencyEmail = document.getElementById('agencyEmail')?.value.trim() || '';
    const docTypeVal = document.getElementById('documentTypeSelect')?.value || 'proposal';

    if (!client || !goals) {
        alert("Bitte gib zumindest einen Kundennamen und einige Stichpunkte zum Projektziel ein.");
        return;
    }

    const docTypeUsage = currentUserProfile.freeProposalsUsedByDocType || {};
    const used = docTypeUsage[docTypeVal] || 0;
    if (currentUser && !currentUserProfile.isPro && used >= 1) {
        const docTypeNames = {
            proposal: 'Angebot',
            briefing: 'Briefing',
            contract: 'Vertrag',
            roadmap: 'Roadmap',
            signoff: 'Abnahme',
            invoice: 'Rechnung'
        };
        const currentName = docTypeNames[docTypeVal] || 'Angebot';
        showPaywallModal(
            "Limit erreicht",
            `Dein kostenloses ${currentName} ist aufgebraucht. Upgrade auf Pro (29€/Monat), um ab sofort unbegrenzt Dokumente zu erstellen.`
        );
        return;
    }

    const loader = document.getElementById('loader');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    loader.classList.remove('hidden');
    statusDot.className = "w-2 h-2 rounded-full bg-blue-500 animate-ping";
    statusText.textContent = "KI generiert Text...";

    const docHeadingLabels = {
        proposal: { de: 'Angebot', en: 'Proposal', fr: 'Proposition', es: 'Propuesta' },
        briefing: { de: 'Briefing', en: 'Briefing', fr: 'Briefing', es: 'Briefing' },
        contract: { de: 'Vertrag', en: 'Contract', fr: 'Contrat', es: 'Contrato' },
        roadmap: { de: 'Roadmap', en: 'Roadmap', fr: 'Roadmap', es: 'Roadmap' },
        signoff: { de: 'Abnahme', en: 'Sign-off', fr: 'Réception', es: 'Acta de entrega' },
        invoice: { de: 'Rechnung', en: 'Invoice', fr: 'Facture', es: 'Factura' }
    };
    const docLabelMap = docHeadingLabels[docTypeVal] || docHeadingLabels.proposal;
    const headingPrefix = docLabelMap[selectedLanguage] || docLabelMap.de || 'Dokument';

    try {
        const headers = await getAuthHeaders();

        const langVal = document.getElementById('proposalLanguageSelect')?.value || selectedLanguage;
        const toneVal = document.getElementById('proposalToneSelect')?.value || selectedTone;

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                clientName: client,
                projectGoals: goals,
                deliverables: deliverables,
                category: category,
                budget: budget,
                deadline: deadline,
                agencyName: agency,
                agencyEmail: agencyEmail,
                language: langVal,
                tone: toneVal,
                documentType: docTypeVal
            })
        });

        if (response.status === 403) {
            const errData = await response.json();
            loader.classList.add('hidden');
            showPaywallModal("Limit erreicht", errData.message);
            return;
        }

        let generatedHTML = '';
        if (response.ok) {
            const data = await response.json();
            generatedHTML = data.html;

            // Increment local profile count on successful generate
            if (currentUser && !currentUserProfile.isPro) {
                if (!currentUserProfile.freeProposalsUsedByDocType) {
                    currentUserProfile.freeProposalsUsedByDocType = {};
                }
                currentUserProfile.freeProposalsUsedByDocType[docTypeVal] = (currentUserProfile.freeProposalsUsedByDocType[docTypeVal] || 0) + 1;
                updatePlanBadge();
            }
        } else {
            generatedHTML = buildLocalI18nDocumentTemplate(docTypeVal, selectedLanguage, client, goals, category, budget, deadline, agency, deliverables);
        }

        document.getElementById('aiTextContent').innerHTML = generatedHTML;
        
        document.getElementById('docHeading').textContent = `${headingPrefix}: ${category}`;
        isProposalGenerated = true;

        loader.classList.add('hidden');
        statusDot.className = "w-2 h-2 rounded-full bg-emerald-400";
        statusText.textContent = "Dokument generiert";

        if (!currentUser) {
            showUnlockOverlay(true);
        }

    } catch (err) {
        console.warn("Backend nicht erreichbar, nutze lokale Engine:", err);
        const generatedHTML = buildLocalI18nDocumentTemplate(docTypeVal, selectedLanguage, client, goals, category, budget, deadline, agency, deliverables);
        document.getElementById('aiTextContent').innerHTML = generatedHTML;
        
        document.getElementById('docHeading').textContent = `${headingPrefix}: ${category}`;
        isProposalGenerated = true;
        loader.classList.add('hidden');

        if (!currentUser) {
            showUnlockOverlay(true);
        }
    }
}

function buildLocalI18nProposalTemplate(lang, client, goals, category, budget, deadline, agency, deliverables = '') {
    const type = document.getElementById('documentTypeSelect')?.value || 'proposal';
    return buildLocalI18nDocumentTemplate(type, lang, client, goals, category, budget, deadline, agency, deliverables);
}

function buildLocalI18nDocumentTemplate(type, lang, client, goals, category, budget, deadline, agency, deliverables = '') {
    const bulletPoints = goals.split('\n').filter(line => line.trim().length > 0);
    const parsedBulletList = bulletPoints.map(item => `<li>${item.replace(/^[-*•]\s*/, '')}</li>`).join('');

    const deliverablePoints = deliverables.split('\n').filter(line => line.trim().length > 0);
    const parsedDeliverablesList = deliverablePoints.map(item => `<li>${item.replace(/^[-*•]\s*/, '')}</li>`).join('');

    const isDe = lang === 'de' || !['en', 'fr', 'es'].includes(lang);

    if (type === 'briefing') {
        if (isDe) {
            return `
                <p><strong>PROJEKT-BRIEFING & ANFORDERUNGSANALYSE</strong></p>
                <p>Kunde: <strong>${client}</strong> | Ersteller: <strong>${agency}</strong></p>
                <h2>1. Projektziele & Rahmenbedingungen</h2>
                <p>Dieses Dokument definiert die Anforderungen für das Projekt <em>${category}</em>.</p>
                <h2>2. Kernanforderungen</h2>
                <ul>${parsedBulletList || '<li>Anforderungsanalyse und Zielgruppendefinition</li>'}</ul>
                <h2>3. Vorgesehene Arbeitsschritte</h2>
                ${parsedDeliverablesList ? `<ul>${parsedDeliverablesList}</ul>` : '<p>Detaillierte Analyse, Soll-Konzept, technische Spezifikationen und Freigabeprozess.</p>'}
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        } else {
            return `
                <p><strong>PROJECT BRIEFING & SCOPING PROTOCOL</strong></p>
                <p>Client: <strong>${client}</strong> | Prepared by: <strong>${agency}</strong></p>
                <h2>1. Project Objectives & Context</h2>
                <p>This document details the scoping requirements for the <em>${category}</em> project.</p>
                <h2>2. Key Requirements</h2>
                <ul>${parsedBulletList || '<li>Scoping phase and audience mapping</li>'}</ul>
                <h2>3. Action Items</h2>
                ${parsedDeliverablesList ? `<ul>${parsedDeliverablesList}</ul>` : '<p>Requirements gathering, solution architecture, technical specifications, and scoping sign-off.</p>'}
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        }
    }

    if (type === 'contract') {
        if (isDe) {
            return `
                <p><strong>DIENSTLEISTUNGSVERTRAG & STATEMENT OF WORK (SOW)</strong></p>
                <p>Zwischen dem Auftraggeber <strong>${client}</strong> und dem Dienstleister <strong>${agency}</strong>.</p>
                <h2>1. Vertragsgegenstand</h2>
                <p>Gegenstand des Vertrages ist die Erbringung von Dienstleistungen im Bereich <em>${category}</em>.</p>
                <h2>2. Leistungsumfang</h2>
                <ul>${parsedBulletList || '<li>Projektleistungen laut Absprache</li>'}</ul>
                <h2>3. Vergütung</h2>
                <p>Die Vergütung beläuft sich auf ein Pauschalhonorar von <strong>${budget}</strong>.</p>
                <h2>4. Fristen</h2>
                <p>Die geplante Fertigstellung erfolgt bis zum: <strong>${deadline}</strong>.</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        } else {
            return `
                <p><strong>SERVICE AGREEMENT & STATEMENT OF WORK (SOW)</strong></p>
                <p>Between <strong>${client}</strong> (Client) and <strong>${agency}</strong> (Service Provider).</p>
                <h2>1. Scope of Services</h2>
                <p>This agreement governs the delivery of services for the project: <em>${category}</em>.</p>
                <h2>2. Deliverables</h2>
                <ul>${parsedBulletList || '<li>Project deliverables as agreed</li>'}</ul>
                <h2>3. Compensation</h2>
                <p>The total net compensation is <strong>${budget}</strong>.</p>
                <h2>4. Timeline</h2>
                <p>The estimated project deadline is: <strong>${deadline}</strong>.</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        }
    }

    if (type === 'roadmap') {
        if (isDe) {
            return `
                <p><strong>PROJEKT KICKOFF-ROADMAP & ONBOARDING</strong></p>
                <p>Kunde: <strong>${client}</strong> | Partner: <strong>${agency}</strong></p>
                <h2>1. Fahrplan für das Projekt</h2>
                <p>Hier ist der Fahrplan für das Projekt: <em>${category}</em>.</p>
                <h2>2. Meilensteine & Phasen</h2>
                <p>Voraussichtliche Laufzeit: <strong>${deadline}</strong>.</p>
                <h2>3. Kick-off Action Items</h2>
                <ul>${parsedBulletList || '<li>Kickoff Meeting und Dokumentenfreigabe</li>'}</ul>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        } else {
            return `
                <p><strong>PROJECT KICKOFF & ONBOARDING ROADMAP</strong></p>
                <p>Client: <strong>${client}</strong> | Partner: <strong>${agency}</strong></p>
                <h2>1. Project Roadmap Overview</h2>
                <p>Roadmap path for the project: <em>${category}</em>.</p>
                <h2>2. Milestones & Delivery Phases</h2>
                <p>Estimated project duration: <strong>${deadline}</strong>.</p>
                <h2>3. Action Items & Next Steps</h2>
                <ul>${parsedBulletList || '<li>Kickoff meeting and asset sharing</li>'}</ul>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        }
    }

    if (type === 'signoff') {
        if (isDe) {
            return `
                <p><strong>PROJEKTABNAHME & ABNAHMEPROTOKOLL</strong></p>
                <p>Auftraggeber: <strong>${client}</strong> | Auftragnehmer: <strong>${agency}</strong></p>
                <h2>1. Abnahmeerklärung der Leistungen</h2>
                <p>Der Auftraggeber bestätigt die vollständige und mängelfreie Umsetzung des Projekts <em>${category}</em>.</p>
                <h2>2. Abgenommene Teilleistungen</h2>
                <ul>${parsedBulletList || '<li>Alle vereinbarten Meilensteine wurden erfolgreich abgenommen</li>'}</ul>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        } else {
            return `
                <p><strong>PROJECT SIGN-OFF & ACCEPTANCE PROTOCOL</strong></p>
                <p>Client: <strong>${client}</strong> | Agency: <strong>${agency}</strong></p>
                <h2>1. Acceptance Declaration</h2>
                <p>The client declares that all deliverables for the project <em>${category}</em> have been accepted in full.</p>
                <h2>2. Approved Checklist Items</h2>
                <ul>${parsedBulletList || '<li>All project stages completed and approved</li>'}</ul>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        }
    }

    if (type === 'invoice') {
        if (isDe) {
            return `
                <p><strong>RECHNUNG / VORAB-RECHNUNG</strong></p>
                <p>Absender: <strong>${agency}</strong><br>Empfänger: <strong>${client}</strong></p>
                <h2>1. Leistungsaufstellung</h2>
                <ul>${parsedBulletList || '<li>Projektleistungen laut Angebot</li>'}</ul>
                <h2>2. Gesamtsumme</h2>
                <p>Betrag: <strong>${budget}</strong> (zzgl. MwSt. falls anwendbar).</p>
                <h2>3. Zahlungskonditionen</h2>
                <p>Zahlbar innerhalb von 14 Tagen. Fällig am: <strong>${deadline}</strong>.</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        } else {
            return `
                <p><strong>INVOICE / PRE-INVOICE</strong></p>
                <p>From: <strong>${agency}</strong><br>To: <strong>${client}</strong></p>
                <h2>1. Itemized Services</h2>
                <ul>${parsedBulletList || '<li>Project services as agreed</li>'}</ul>
                <h2>2. Summary of Charges</h2>
                <p>Total Net Amount: <strong>${budget}</strong></p>
                <h2>3. Payment Terms</h2>
                <p>Settle within 14 days. Due date: <strong>${deadline}</strong>.</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        }
    }

    // Default: proposal
    switch (lang) {
        case 'en':
            return `
                <p>Dear Team of <strong>${client}</strong>,</p>
                <p>Thank you for the briefing discussion and your trust in <strong>${agency}</strong>. We have prepared the following proposal for your <em>${category}</em> initiative.</p>
                <h2>1. Objectives & Scope</h2>
                <ul>${parsedBulletList || '<li>Brand positioning and web development</li>'}</ul>
                <h2>2. Scope of Work & Deliverables</h2>
                ${parsedDeliverablesList ? `<ul>${parsedDeliverablesList}</ul>` : '<p>Full-cycle delivery across UX/UI design, technical development, SEO foundation and official deployment.</p>'}
                <h2>3. Timeline</h2>
                <p>Scheduled execution time: <strong>${deadline}</strong>.</p>
                <h2>4. Investment & Commercial Terms</h2>
                <p>Total investment: <strong>${budget}</strong> (net).</p>
                <h2>5. Next Steps</h2>
                <p>Approve via digital signature to start implementation.</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        case 'fr':
            return `
                <p>Chère équipe de <strong>${client}</strong>,</p>
                <p>Merci pour nos échanges et votre confiance envers <strong>${agency}</strong> pour votre projet <em>${category}</em>.</p>
                <h2>1. Objectifs du Projet</h2>
                <ul>${parsedBulletList || '<li>Développement et optimisation digitale</li>'}</ul>
                <h2>2. Périmètre d'Intervention</h2>
                ${parsedDeliverablesList ? `<ul>${parsedDeliverablesList}</ul>` : '<p>Conception UI/UX, développement web clean-code, référencement et mise en ligne.</p>'}
                <h2>3. Calendrier & Délais</h2>
                <p>Délai prévisionnel : <strong>${deadline}</strong>.</p>
                <h2>4. Investissement</h2>
                <p>Budget total : <strong>${budget}</strong> (HT).</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        case 'es':
            return `
                <p>Estimado equipo de <strong>${client}</strong>,</p>
                <p>Muchas gracias por la reunión y por su confianza en <strong>${agency}</strong> para su proyecto <em>${category}</em>.</p>
                <h2>1. Objetivos del Proyecto</h2>
                <ul>${parsedBulletList || '<li>Desarrollo y diseño web profesional</li>'}</ul>
                <h2>2. Alcance del Trabajo</h2>
                ${parsedDeliverablesList ? `<ul>${parsedDeliverablesList}</ul>` : '<p>Diseño UI/UX, programación responsive, SEO on-page y entrega formal.</p>'}
                <h2>3. Cronograma</h2>
                <p>Plazo estimado : <strong>${deadline}</strong>.</p>
                <h2>4. Inversión</h2>
                <p>Presupuesto : <strong>${budget}</strong> (Neto).</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
        case 'de':
        default:
            return `
                <p>Sehr geehrte Damen und Herren,<br>sehr geehrtes Team von <strong>${client}</strong>,</p>
                <p>vielen Dank für das angenehme Vorgespräch und Ihr Vertrauen in <strong>${agency}</strong>. Basierend auf Ihren individuellen Anforderungen haben wir folgendes maßgeschneidertes B2B-Umsetzungskonzept für Sie erarbeitet.</p>
                
                <h2>1. Ausgangslage & Zielsetzung</h2>
                <p>Ziel dieses Projekts im Bereich <em>${category}</em> ist es, eine moderne, performante und conversion-starke digitale Lösung zu realisieren, die messbare Resultate liefert.</p>
                
                <blockquote>
                    <strong>Definierte Kernziele & Anforderungen:</strong>
                    <ul class="mt-2 space-y-1">
                        ${parsedBulletList || '<li>Optimierung des digitalen Markenauftritts</li><li>Gewinnung qualifizierter Leads und Neukunden</li>'}
                    </ul>
                </blockquote>

                <h2>2. Leistungsumfang & Deliverables</h2>
                ${parsedDeliverablesList ? `
                <p>Unser Leistungspaket umfasst die folgenden, individuell auf Ihr Vorhaben abgestimmten Arbeitspakete und Phasen:</p>
                <ul class="mt-2 space-y-1.5">
                    ${parsedDeliverablesList}
                </ul>
                ` : `
                <p>Unser Leistungspaket umfasst alle essenziellen Phasen bis zum erfolgreichen Go-Live (Strategie, UI/UX, Entwicklung, SEO & Launch).</p>
                `}

                <h2>3. Timeline & Meilensteine</h2>
                <p>Die geplante Projektlaufzeit beträgt <strong>${deadline}</strong>.</p>

                <h2>4. Investition & Zahlungsmodalitäten</h2>
                <p>Die Gesamtkosten belaufen sich auf <strong>${budget}</strong> (zzgl. gesetzlicher MwSt.).</p>

                <h2>5. Nächste Schritte</h2>
                <p>Zur Freigabe genügt eine digitale Signatur über unser Freigabe-Portal.</p>
                <p class="mt-4 font-semibold">${agency}</p>
            `;
    }
}

function showUnlockOverlay(blurDocument = true) {
    const docBlurWrapper = document.getElementById('documentBlurWrapper');
    const unlockOverlay = document.getElementById('unlockOverlay');

    if (blurDocument) {
        docBlurWrapper.classList.add('doc-blurred');
    }

    unlockOverlay.classList.remove('hidden');
    setTimeout(() => {
        unlockOverlay.classList.remove('opacity-0');
        unlockOverlay.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function resetDocument() {
    if (confirm("Möchtest du das Dokument auf den Ausgangszustand zurücksetzen?")) {
        document.getElementById('aiTextContent').innerHTML = `
            <p class="text-slate-400 italic">Trage links deine Projekt-Stichpunkte ein und klicke auf <strong>"Angebot mit KI generieren"</strong>. Das fertige Angebot erscheint sofort hier.</p>
        `;
        document.getElementById('statusDot').className = "w-2 h-2 rounded-full bg-amber-400";
        document.getElementById('statusText').textContent = "Vorschau bereit";
        document.getElementById('documentBlurWrapper').classList.remove('doc-blurred');
        document.getElementById('unlockOverlay').classList.add('hidden');
        document.getElementById('openTrackingModalBtn')?.classList.add('hidden');
        activePublishedProposalId = null;
        isProposalGenerated = false;
    }
}

// =============================================================================
// 10. FEATURE 1, 4 & 5: E-SIGN PROPOSAL PUBLISHING (WITH THEME & LANGUAGE)
// =============================================================================
function bindESignShareEvents() {
    const publishESignBtn = document.getElementById('publishESignBtn');
    const eSignShareModal = document.getElementById('eSignShareModal');
    const closeESignModalBtn = document.getElementById('closeESignModalBtn');
    const doneESignModalBtn = document.getElementById('doneESignModalBtn');
    const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');

    publishESignBtn?.addEventListener('click', handlePublishESign);

    const closeModal = () => {
        eSignShareModal.classList.add('opacity-0');
        eSignShareModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => eSignShareModal.classList.add('hidden'), 300);
    };

    closeESignModalBtn?.addEventListener('click', closeModal);
    doneESignModalBtn?.addEventListener('click', closeModal);

    copyShareUrlBtn?.addEventListener('click', () => {
        const input = document.getElementById('eSignShareUrlInput');
        input.select();
        navigator.clipboard.writeText(input.value);
        
        const copyText = document.getElementById('copyShareBtnText');
        copyText.textContent = "Kopiert!";
        setTimeout(() => copyText.textContent = "Kopieren", 2000);
    });
}

async function handlePublishESign() {
    if (!currentUser) {
        showUnlockOverlay(true);
        return;
    }

    if (!currentUserProfile.isPro) {
        showPaywallModal(
            "E-Sign, CRM & Live Tracking freischalten",
            "Das Versenden von papierlosen Dokumenten per Freigabe-Link, digitaler Unterschrift und CRM-Automatisierung ist ein exklusives Pro-Feature. Upgrade auf AgencyOS Pro, um ab sofort papierlos abzuschließen."
        );
        return;
    }

    const client = document.getElementById('clientName').value.trim();
    const htmlContent = document.getElementById('aiTextContent').innerHTML;
    const docTypeVal = document.getElementById('documentTypeSelect')?.value || 'proposal';

    if (!client) {
        alert("Bitte gib einen Kundennamen ein.");
        return;
    }

    const publishBtn = document.getElementById('publishESignBtn');
    setButtonLoading(publishBtn, true, 'Erstelle E-Sign Link...');

    try {
        const enableRoiCalc = document.getElementById('enableRoiCalc')?.checked || false;
        const roiCalculator = {
            enabled: enableRoiCalc,
            title: document.getElementById('roiCalcTitle')?.value.trim() || 'Geschätzter Mehrumsatz & ROI-Rechner',
            sliderLabel: document.getElementById('roiSliderLabel')?.value.trim() || 'Zusätzliche Neukunden / Monat',
            baseValue: parseFloat(document.getElementById('roiBaseValue')?.value) || 500,
            multiplier: parseFloat(document.getElementById('roiMultiplier')?.value) || 12,
            unit: document.getElementById('roiUnit')?.value.trim() || 'Kunden'
        };

        const enableAutoFollowUp = document.getElementById('enableAutoFollowUp')?.checked ?? true;
        const autoFollowUp = {
            enabled: enableAutoFollowUp,
            delayHours: 48,
            status: enableAutoFollowUp ? 'scheduled' : 'disabled'
        };

        const headers = await getAuthHeaders();
        const response = await fetch('/api/proposals/publish', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                clientName: client,
                clientEmail: '',
                category: document.getElementById('projectCategory').value.trim(),
                budget: document.getElementById('projectBudget').value.trim() || 'Nach Vereinbarung',
                deadline: document.getElementById('projectDeadline').value.trim() || 'ca. 4-6 Wochen',
                agencyName: document.getElementById('agencyName').value.trim() || currentUserProfile.agencyName,
                agencyEmail: document.getElementById('agencyEmail').value.trim() || currentUserProfile.agencyEmail,
                logoUrl: currentUserProfile.logoUrl || '',
                proposalHTML: htmlContent,
                language: selectedLanguage,
                tone: selectedTone,
                theme: selectedTheme,
                roiCalculator: roiCalculator,
                autoFollowUp: autoFollowUp,
                documentType: docTypeVal
            })
        });

        if (response.status === 403) {
            const errData = await response.json();
            showPaywallModal("Pro-Feature erforderlich", errData.message);
            return;
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Fehler beim Erstellen des E-Sign Links.');
        }

        const data = await response.json();
        activePublishedProposalId = data.proposalId;

        // Update proposals in background & update count badge
        loadUserProposals();

        // Tracking Button im Dashboard aktivieren
        const trackingBtn = document.getElementById('openTrackingModalBtn');
        trackingBtn.classList.remove('hidden');

        // Modal mit Link füllen
        const modal = document.getElementById('eSignShareModal');
        document.getElementById('eSignShareUrlInput').value = data.shareUrl;
        document.getElementById('openShareUrlLink').href = data.shareUrl;

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
        }, 10);

    } catch (err) {
        console.error("E-Sign Publish Fehler:", err);
        alert("Fehler: " + err.message);
    } finally {
        setButtonLoading(publishBtn, false, '<svg class="w-4 h-4 text-emerald-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg><span>E-Sign Link</span><span class="text-[9px] font-extrabold uppercase tracking-wider bg-slate-950/30 px-1.5 py-0.5 rounded text-emerald-200">PRO</span>');
    }
}

// =============================================================================
// 11. FEATURE 2: CRM & ZAPIER INTEGRATION MODAL LOGIK
// =============================================================================
function bindCrmModalEvents() {
    const openCrmBtn = document.getElementById('openCrmModalBtn');
    const crmModal = document.getElementById('crmModal');
    const closeCrmBtn = document.getElementById('closeCrmModalBtn');
    const cancelCrmBtn = document.getElementById('cancelCrmBtn');
    const crmForm = document.getElementById('crmForm');
    const crmTestBtn = document.getElementById('crmTestWebhookBtn');

    const openModal = async () => {
        if (!currentUser) {
            showUnlockOverlay(true);
            return;
        }

        if (!currentUserProfile.isPro) {
            showPaywallModal(
                "CRM & Zapier Integration freischalten",
                "Verbinde AgencyOS mit Pipedrive, HubSpot, Make & Zapier. Gewonnene Dokumente werden vollautomatisch in deine CRM-Pipeline synchronisiert."
            );
            return;
        }

        crmModal.classList.remove('hidden');
        setTimeout(() => {
            crmModal.classList.remove('opacity-0');
            crmModal.querySelector('div').classList.remove('scale-95');
        }, 10);

        await loadCrmSettings();
    };

    const closeModal = () => {
        crmModal.classList.add('opacity-0');
        crmModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => crmModal.classList.add('hidden'), 300);
    };

    openCrmBtn?.addEventListener('click', openModal);
    closeCrmBtn?.addEventListener('click', closeModal);
    cancelCrmBtn?.addEventListener('click', closeModal);

    crmForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const webhookUrl = document.getElementById('crmWebhookUrl').value.trim();
        const events = [];
        if (document.getElementById('evtProposalSigned').checked) events.push('proposal.signed');
        if (document.getElementById('evtProposalViewed').checked) events.push('proposal.viewed');
        if (document.getElementById('evtProposalCreated').checked) events.push('proposal.created');

        const saveBtn = document.getElementById('saveCrmBtn');
        setButtonLoading(saveBtn, true, 'Speichere Webhook...');

        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/integrations/webhook', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    webhookUrl: webhookUrl,
                    webhookEvents: events,
                    webhookEnabled: true
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Fehler beim Speichern.');
            }

            currentUserProfile.webhookUrl = webhookUrl;
            currentUserProfile.webhookEvents = events;

            alert("✅ CRM & Zapier Webhook erfolgreich gespeichert!");
            closeModal();
        } catch (err) {
            alert("Fehler: " + err.message);
        } finally {
            setButtonLoading(saveBtn, false, 'Webhook speichern');
        }
    });

    crmTestBtn?.addEventListener('click', async () => {
        const webhookUrl = document.getElementById('crmWebhookUrl').value.trim();
        const statusText = document.getElementById('crmTestStatusText');

        if (!webhookUrl || (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://'))) {
            alert("Bitte gib zuerst eine gültige Webhook-URL ein.");
            return;
        }

        setButtonLoading(crmTestBtn, true, 'Sende Test...');
        statusText.textContent = "Sende Test-Payload an Webhook...";

        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/integrations/test', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ webhookUrl: webhookUrl })
            });

            const data = await res.json();

            if (data.success) {
                statusText.className = "text-[11px] text-emerald-400 font-medium";
                statusText.textContent = `✅ Test erfolgreich empfangen! (HTTP ${data.status})`;
            } else {
                statusText.className = "text-[11px] text-red-400 font-medium";
                statusText.textContent = `❌ Test fehlgeschlagen (HTTP ${data.status || 'Error'}: ${data.error || 'Timeout'})`;
            }
        } catch (err) {
            statusText.className = "text-[11px] text-red-400 font-medium";
            statusText.textContent = `❌ Verbindungsfehler: ${err.message}`;
        } finally {
            setButtonLoading(crmTestBtn, false, '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>Test senden</span>');
        }
    });
}

async function loadCrmSettings() {
    try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/integrations/webhook', { headers: headers });
        if (!res.ok) return;

        const data = await res.json();
        if (data.webhook) {
            document.getElementById('crmWebhookUrl').value = data.webhook.webhookUrl || '';
            const evts = data.webhook.webhookEvents || ['proposal.signed'];
            document.getElementById('evtProposalSigned').checked = evts.includes('proposal.signed');
            document.getElementById('evtProposalViewed').checked = evts.includes('proposal.viewed');
            document.getElementById('evtProposalCreated').checked = evts.includes('proposal.created');
        }
    } catch (e) {
        console.warn("Konnte Webhook-Einstellungen nicht laden:", e);
    }
}

// =============================================================================
// 12. FEATURE 3: LIVE PROPOSAL TRACKING ANALYTICS MODAL
// =============================================================================
function bindTrackingEvents() {
    const openTrackingBtn = document.getElementById('openTrackingModalBtn');
    const trackingModal = document.getElementById('trackingModal');
    const closeTrackingBtn = document.getElementById('closeTrackingModalBtn');
    const closeTrackingBtn2 = document.getElementById('closeTrackingBtn2');
    const refreshBtn = document.getElementById('refreshAnalyticsBtn');

    const openModal = async () => {
        if (!activePublishedProposalId) return;
        trackingModal.classList.remove('hidden');
        setTimeout(() => {
            trackingModal.classList.remove('opacity-0');
            trackingModal.querySelector('div').classList.remove('scale-95');
        }, 10);

        await loadProposalAnalytics();
        startAnalyticsPolling();
    };

    const closeModal = () => {
        stopAnalyticsPolling();
        trackingModal.classList.add('opacity-0');
        trackingModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => trackingModal.classList.add('hidden'), 300);
    };

    openTrackingBtn?.addEventListener('click', openModal);
    closeTrackingBtn?.addEventListener('click', closeModal);
    closeTrackingBtn2?.addEventListener('click', closeModal);

    refreshBtn?.addEventListener('click', async () => {
        const icon = document.getElementById('refreshIcon');
        icon.classList.add('animate-spin');
        await loadProposalAnalytics();
        setTimeout(() => icon.classList.remove('animate-spin'), 600);
    });
}

function startAnalyticsPolling() {
    if (analyticsPollingTimer) clearInterval(analyticsPollingTimer);
    analyticsPollingTimer = setInterval(loadProposalAnalytics, 8000);
}

function stopAnalyticsPolling() {
    if (analyticsPollingTimer) {
        clearInterval(analyticsPollingTimer);
        analyticsPollingTimer = null;
    }
}

async function loadProposalAnalytics() {
    if (!activePublishedProposalId) return;

    try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/proposals/${encodeURIComponent(activePublishedProposalId)}/analytics`, {
            headers: headers
        });

        if (!res.ok) return;

        const data = await res.json();
        renderAnalytics(data.analytics);
    } catch (e) {
        console.warn("Analytics Abruf fehlgeschlagen:", e);
    }
}

function renderAnalytics(a) {
    if (!a) return;

    document.getElementById('metricViewCount').textContent = a.viewCount || 0;
    document.getElementById('metricDuration').textContent = formatDuration(a.totalDurationSeconds || 0);

    document.getElementById('detailFirstViewed').textContent = a.firstViewedAt ? new Date(a.firstViewedAt).toLocaleString('de-DE') : 'Noch nicht geöffnet';
    document.getElementById('detailLastViewed').textContent = a.lastViewedAt ? new Date(a.lastViewedAt).toLocaleString('de-DE') : '-';

    const detailSignStatus = document.getElementById('detailSignStatus');
    if (a.status === 'signed') {
        detailSignStatus.className = "font-bold text-emerald-400";
        detailSignStatus.textContent = `✓ Signiert (${a.signature?.signerName || 'Kunde'})`;
    } else if (a.status === 'viewed') {
        detailSignStatus.className = "font-bold text-blue-400";
        detailSignStatus.textContent = "Wartet auf Signatur (Angesehen)";
    } else {
        detailSignStatus.className = "font-bold text-amber-400";
        detailSignStatus.textContent = "Wartet auf Signatur (Noch nicht geöffnet)";
    }

    const trackingLivePing = document.getElementById('trackingLivePing');
    const trackingLiveDot = document.getElementById('trackingLiveDot');
    const modalLivePing = document.getElementById('modalLivePing');
    const modalLiveDot = document.getElementById('modalLiveDot');
    const modalLiveStatusTitle = document.getElementById('modalLiveStatusTitle');
    const modalLiveStatusSubtitle = document.getElementById('modalLiveStatusSubtitle');
    const trackingBtnText = document.getElementById('trackingBtnText');

    if (a.isCurrentlyViewing) {
        trackingLivePing.classList.remove('hidden');
        trackingLiveDot.className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-400";
        modalLivePing.classList.remove('hidden');
        modalLiveDot.className = "relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400";
        
        modalLiveStatusTitle.textContent = "🟢 Kunde liest gerade online!";
        modalLiveStatusSubtitle.textContent = "Das Angebot ist aktuell im Browser des Kunden aktiv geöffnet.";
        trackingBtnText.textContent = "🟢 Kunde online";
    } else if (a.viewCount > 0) {
        trackingLivePing.classList.add('hidden');
        trackingLiveDot.className = "relative inline-flex rounded-full h-2 w-2 bg-blue-400";
        modalLivePing.classList.add('hidden');
        modalLiveDot.className = "relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-400";

        modalLiveStatusTitle.textContent = "Angebot wurde angesehen";
        modalLiveStatusSubtitle.textContent = `Zuletzt aktiv am ${a.lastViewedAt ? new Date(a.lastViewedAt).toLocaleTimeString('de-DE') : '-'}`;
        trackingBtnText.textContent = `${a.viewCount}x geöffnet`;
    } else {
        trackingLivePing.classList.add('hidden');
        trackingLiveDot.className = "relative inline-flex rounded-full h-2 w-2 bg-slate-500";
        modalLivePing.classList.add('hidden');
        modalLiveDot.className = "relative inline-flex rounded-full h-3.5 w-3.5 bg-slate-500";

        modalLiveStatusTitle.textContent = "Wartet auf ersten Aufruf";
        modalLiveStatusSubtitle.textContent = "Der Kunde hat den Link noch nicht geöffnet.";
        trackingBtnText.textContent = "Live Tracking";
    }
}

function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return '0s';
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function openTrackingForProposal(pId) {
    if (!pId) return;
    activePublishedProposalId = pId;
    const trackingModal = document.getElementById('trackingModal');
    if (!trackingModal) return;
    
    trackingModal.classList.remove('hidden');
    setTimeout(() => {
        trackingModal.classList.remove('opacity-0');
        trackingModal.querySelector('div')?.classList.remove('scale-95');
    }, 10);

    loadProposalAnalytics();
    startAnalyticsPolling();
}

// =============================================================================
// 12b. FEATURE 3: PROPOSALS DASHBOARD MODAL & ANALYTICS OVERVIEW
// =============================================================================
function bindDashboardModalEvents() {
    const openDashboardBtn = document.getElementById('openDashboardModalBtn');
    const dashboardModal = document.getElementById('dashboardModal');
    const closeDashboardBtn = document.getElementById('closeDashboardModalBtn');
    const closeDashboardBottomBtn = document.getElementById('closeDashboardModalBottomBtn');
    const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');

    const openModal = async () => {
        if (!currentUser) {
            showUnlockOverlay(true);
            return;
        }

        dashboardModal.classList.remove('hidden');
        setTimeout(() => {
            dashboardModal.classList.remove('opacity-0');
            dashboardModal.querySelector('div')?.classList.remove('scale-95');
        }, 10);

        await loadUserProposals();
    };

    const closeModal = () => {
        dashboardModal.classList.add('opacity-0');
        dashboardModal.querySelector('div')?.classList.add('scale-95');
        setTimeout(() => dashboardModal.classList.add('hidden'), 300);
    };

    openDashboardBtn?.addEventListener('click', openModal);
    closeDashboardBtn?.addEventListener('click', closeModal);
    closeDashboardBottomBtn?.addEventListener('click', closeModal);

    refreshDashboardBtn?.addEventListener('click', async () => {
        const svg = refreshDashboardBtn.querySelector('svg');
        svg?.classList.add('animate-spin');
        await loadUserProposals();
        setTimeout(() => svg?.classList.remove('animate-spin'), 600);
    });
}

async function loadUserProposals() {
    if (!currentUser) return;
    const loadingEl = document.getElementById('dashboardLoading');
    const emptyEl = document.getElementById('dashboardEmptyState');
    const tableContainer = document.getElementById('dashboardTableContainer');
    const summaryText = document.getElementById('dashboardSummaryText');
    const countBadge = document.getElementById('dashboardCountBadge');

    try {
        loadingEl?.classList.remove('hidden');
        emptyEl?.classList.add('hidden');
        tableContainer?.classList.add('hidden');

        const headers = await getAuthHeaders();
        const res = await fetch('/api/proposals', { headers: headers });
        if (!res.ok) {
            throw new Error('Fehler beim Abrufen der Angebote');
        }

        const data = await res.json();
        userProposalsList = data.proposals || [];

        if (countBadge) {
            if (userProposalsList.length > 0) {
                countBadge.textContent = userProposalsList.length;
                countBadge.classList.remove('hidden');
            } else {
                countBadge.classList.add('hidden');
            }
        }

        if (summaryText) {
            summaryText.textContent = `${userProposalsList.length} Angebot${userProposalsList.length === 1 ? '' : 'e'} gelistet`;
        }

        loadingEl?.classList.add('hidden');

        if (userProposalsList.length === 0) {
            emptyEl?.classList.remove('hidden');
            tableContainer?.classList.add('hidden');
        } else {
            emptyEl?.classList.add('hidden');
            tableContainer?.classList.remove('hidden');
            renderDashboardTable(userProposalsList);
        }
    } catch (e) {
        console.warn("Konnte Angebote nicht laden:", e);
        loadingEl?.classList.add('hidden');
        if (userProposalsList.length === 0) {
            emptyEl?.classList.remove('hidden');
        }
    }
}

function renderDashboardTable(proposals) {
    const tbody = document.getElementById('dashboardTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    proposals.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800/40 transition-colors";

        // Status Badge
        let statusBadgeHtml = '';
        if (p.status === 'signed') {
            statusBadgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Unterzeichnet</span>`;
        } else if (p.status === 'viewed') {
            statusBadgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>Gesehen</span>`;
        } else {
            statusBadgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Ausstehend</span>`;
        }

        // Follow-Up Badge & Info
        let followUpBadgeHtml = '';
        const fu = p.autoFollowUp || {};
        if (p.status === 'signed') {
            followUpBadgeHtml = `<span class="text-[10px] text-emerald-400 font-medium">Deaktiviert (Signiert)</span>`;
        } else if (fu.status === 'sent') {
            const sentDate = fu.sentAt ? new Date(fu.sentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
            followUpBadgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700" title="Gesendet am ${sentDate}">✉️ Gesendet</span>`;
        } else if (fu.enabled !== false) {
            followUpBadgeHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20" title="Auto-Trigger nach 48h">⏱️ Geplant (48h)</span>`;
        } else {
            followUpBadgeHtml = `<span class="text-[10px] text-slate-500">Deaktiviert</span>`;
        }

        const dateFormatted = p.createdAt ? new Date(p.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
        const durationFormatted = formatDuration(p.totalDurationSeconds || 0);

        tr.innerHTML = `
            <td class="py-3 px-4">
                <div class="font-semibold text-white truncate max-w-[180px] sm:max-w-xs">${escapeHtml(p.clientName || 'Unbenannter Kunde')}</div>
                <div class="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-xs">${escapeHtml(p.category || 'Projektangebot')}</div>
            </td>
            <td class="py-3 px-3 font-mono text-slate-200 whitespace-nowrap">${escapeHtml(p.budget || '-')}</td>
            <td class="py-3 px-3 whitespace-nowrap">${statusBadgeHtml}</td>
            <td class="py-3 px-3 whitespace-nowrap">${followUpBadgeHtml}</td>
            <td class="py-3 px-3 font-semibold text-slate-200 whitespace-nowrap">${p.viewCount || 0}x</td>
            <td class="py-3 px-3 text-slate-400 whitespace-nowrap">${durationFormatted}</td>
            <td class="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">${dateFormatted}</td>
            <td class="py-3 px-4 text-right whitespace-nowrap">
                <div class="inline-flex items-center gap-1.5">
                    <button type="button" class="copy-proposal-link-btn p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors" title="Magic Link kopieren" data-url="${escapeHtml(p.shareUrl || '')}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                    <a href="${escapeHtml(p.shareUrl || '#')}" target="_blank" class="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors" title="Im Kunden-Viewer öffnen">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                    <button type="button" class="view-proposal-tracking-btn p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors" title="Live Tracking Analytics" data-id="${escapeHtml(p.id)}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    </button>
                    <button type="button" class="trigger-followup-btn p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors" title="KI-Follow-up E-Mail jetzt senden" data-id="${escapeHtml(p.id)}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    </button>
                    <button type="button" class="duplicate-proposal-btn p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded-lg transition-colors" title="Angebot klonen / duplizieren" data-id="${escapeHtml(p.id)}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                    </button>
                    <button type="button" class="delete-proposal-btn p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors" title="Angebot löschen" data-id="${escapeHtml(p.id)}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Bind row action buttons
    tbody.querySelectorAll('.copy-proposal-link-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-url');
            if (url) {
                navigator.clipboard.writeText(url);
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
                setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
            }
        });
    });

    tbody.querySelectorAll('.view-proposal-tracking-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pId = btn.getAttribute('data-id');
            if (pId) {
                openTrackingForProposal(pId);
            }
        });
    });

    tbody.querySelectorAll('.duplicate-proposal-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const pId = btn.getAttribute('data-id');
            if (!pId) return;

            btn.disabled = true;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<div class="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>`;

            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/proposals/${pId}/duplicate`, {
                    method: 'POST',
                    headers: headers
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    await loadUserProposals();
                } else {
                    alert(data.message || "Fehler beim Duplizieren des Angebots.");
                }
            } catch (err) {
                console.error("Duplicate Error:", err);
                alert("Fehler beim Verarbeiten des Klon-Antrags.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        });
    });

    tbody.querySelectorAll('.delete-proposal-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const pId = btn.getAttribute('data-id');
            if (!pId) return;
            if (!confirm("Möchtest du dieses Angebot wirklich dauerhaft löschen?")) return;

            btn.disabled = true;
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/proposals/${pId}`, {
                    method: 'DELETE',
                    headers: headers
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    await loadUserProposals();
                } else {
                    alert(data.message || "Fehler beim Löschen des Angebots.");
                }
            } catch (err) {
                console.error("Delete Error:", err);
                alert("Fehler beim Löschen.");
            }
        });
    });

    tbody.querySelectorAll('.trigger-followup-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const pId = btn.getAttribute('data-id');
            if (!pId) return;
            if (!confirm("Möchtest du die KI-Follow-up E-Mail jetzt sofort an den Kunden senden?")) return;

            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<div class="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>`;

            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`/api/proposals/${pId}/send-follow-up`, {
                    method: 'POST',
                    headers: headers
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.message || 'Fehler beim Senden des Follow-ups.');
                }
                alert("✓ KI-Follow-Up E-Mail wurde erfolgreich versendet!");
                loadUserProposals();
            } catch (err) {
                alert("Fehler: " + err.message);
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        });
    });
}

// =============================================================================
// 13. UNLOCK OVERLAY & GOOGLE AUTH LOGIK
// =============================================================================
let unlockAuthMode = 'signup';

function bindUnlockAuthEvents() {
    const unlockTabSignup = document.getElementById('unlockTabSignup');
    const unlockTabLogin = document.getElementById('unlockTabLogin');
    const unlockForm = document.getElementById('unlockForm');
    const googleAuthBtn = document.getElementById('googleAuthBtn');
    const closeUnlockModalBtn = document.getElementById('closeUnlockModalBtn');

    if (unlockTabSignup) unlockTabSignup.addEventListener('click', () => setUnlockAuthMode('signup'));
    if (unlockTabLogin) unlockTabLogin.addEventListener('click', () => setUnlockAuthMode('login'));
    if (unlockForm) unlockForm.addEventListener('submit', handleUnlockAuthSubmit);
    if (googleAuthBtn) googleAuthBtn.addEventListener('click', handleGoogleAuth);
    if (closeUnlockModalBtn) closeUnlockModalBtn.addEventListener('click', hideUnlockOverlay);
}

function hideUnlockOverlay() {
    const unlockOverlay = document.getElementById('unlockOverlay');
    if (!unlockOverlay) return;
    unlockOverlay.classList.add('opacity-0');
    const innerCard = unlockOverlay.querySelector('div');
    if (innerCard) innerCard.classList.add('scale-95');
    setTimeout(() => {
        unlockOverlay.classList.add('hidden');
    }, 300);
}

async function handleGoogleAuth() {
    const googleBtn = document.getElementById('googleAuthBtn');
    const googleBtnText = document.getElementById('googleAuthBtnText');

    if (!isFirebaseReady) {
        showUnlockAlert("Firebase Auth ist noch nicht konfiguriert. Bitte prüfe deine Konfiguration.", "error");
        return;
    }

    const originalText = googleBtnText ? googleBtnText.textContent : 'Mit Google fortfahren';
    setButtonLoading(googleBtn, true, 'Verbinde mit Google...');

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        // Try Popup (seamless on Desktop & Modern Web)
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        console.log("✅ Erfolgreich mit Google authentifiziert:", user.email);
        showUnlockAlert(`Willkommen, ${user.displayName || user.email}!`, "success");

    } catch (error) {
        console.error("Google Auth Fehler:", error);
        if (error.code === 'auth/popup-blocked') {
            console.warn("⚠️ Popup blockiert, wechsle zu signInWithRedirect...");
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithRedirect(provider);
        } else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            showUnlockAlert(getReadableErrorMessage(error), "error");
        }
    } finally {
        setButtonLoading(googleBtn, false, originalText);
    }
}

function setUnlockAuthMode(mode) {
    unlockAuthMode = mode;
    const unlockTabSignup = document.getElementById('unlockTabSignup');
    const unlockTabLogin = document.getElementById('unlockTabLogin');
    const unlockAgencyGroup = document.getElementById('unlockAgencyGroup');
    const unlockSubmitText = document.getElementById('unlockSubmitText');
    const googleAuthBtnText = document.getElementById('googleAuthBtnText');
    const unlockAlert = document.getElementById('unlockAlert');

    unlockAlert.classList.add('hidden');

    if (mode === 'signup') {
        unlockTabSignup.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all shadow-sm";
        unlockTabLogin.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all";
        unlockAgencyGroup.classList.remove('hidden');
        unlockSubmitText.textContent = "Jetzt kostenlos freischalten";
        if (googleAuthBtnText) googleAuthBtnText.textContent = "Mit Google registrieren";
    } else {
        unlockTabLogin.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all shadow-sm";
        unlockTabSignup.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all";
        unlockAgencyGroup.classList.add('hidden');
        unlockSubmitText.textContent = "Anmelden & Angebot freischalten";
        if (googleAuthBtnText) googleAuthBtnText.textContent = "Mit Google anmelden";
    }
}

async function handleUnlockAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('unlockEmail').value.trim();
    const password = document.getElementById('unlockPassword').value;
    const agencyName = document.getElementById('unlockAgencyName')?.value.trim() || document.getElementById('agencyName').value.trim();
    const submitBtn = document.getElementById('unlockSubmitBtn');

    if (!isFirebaseReady) {
        showUnlockAlert("Bitte trage deine echten Firebase-Keys in script.js ein.", "error");
        return;
    }

    setButtonLoading(submitBtn, true, unlockAuthMode === 'signup' ? 'Erstelle Account...' : 'Anmeldung...');

    try {
        if (unlockAuthMode === 'signup') {
            const userCred = await auth.createUserWithEmailAndPassword(email, password);
            await userCred.user.updateProfile({ displayName: agencyName || 'Meine Agentur' });

            showUnlockAlert("Account erstellt! Angebot wird freigeschaltet...", "success");
        } else {
            await auth.signInWithEmailAndPassword(email, password);
        }
    } catch (error) {
        console.error("Unlock Auth Fehler:", error);
        showUnlockAlert(getReadableErrorMessage(error), "error");
    } finally {
        setButtonLoading(submitBtn, false, unlockAuthMode === 'signup' ? 'Jetzt kostenlos freischalten' : 'Anmelden & freischalten');
    }
}

function showUnlockAlert(msg, type = 'error') {
    const alertBox = document.getElementById('unlockAlert');
    alertBox.className = type === 'error'
        ? "mb-3 p-2.5 rounded-xl text-xs flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400"
        : "mb-3 p-2.5 rounded-xl text-xs flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400";
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
}

// =============================================================================
// 14. STORAGE LOGO UPLOAD
// =============================================================================
async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!currentUser || !currentUserProfile.isPro) {
        showPaywallModal(
            "Individuelles Branding freischalten",
            "Logo-Uploads sind exklusiv für Pro-Mitglieder freigeschaltet."
        );
        return;
    }

    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
        alert('Bitte lade ein PNG-, JPEG-, WebP- oder GIF-Bild hoch.');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('Das Logo darf maximal 5 MB groß sein.');
        return;
    }

    const docLogo = document.getElementById('docLogo');
    const logoUploadText = document.getElementById('logoUploadText');

    logoUploadText.textContent = "Lade hoch...";
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Logo konnte nicht gelesen werden.'));
            reader.readAsDataURL(file);
        });
        docLogo.src = dataUrl;
        docLogo.classList.remove('hidden');

        const headers = await getAuthHeaders();
        const response = await fetch('/api/user/logo', {
            method: 'POST',
            headers,
            body: JSON.stringify({ dataUrl })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || result.error || 'Logo-Upload fehlgeschlagen.');
        }

        currentUserProfile.logoUrl = result.logoUrl;
        currentUserProfile.brandLogoUrl = result.logoUrl;
        logoUploadText.textContent = "Logo aktiv (Ändern)";
    } catch (error) {
        console.error("Serverseitiger Logo-Upload Fehler:", error);
        alert("Fehler beim Logo-Upload: " + error.message);
        logoUploadText.textContent = "Firmenlogo hinzufügen";
    }
}

// =============================================================================
// 15. PDF EXPORT & SECURE EXPORT TRACKING
// =============================================================================
async function handlePDFExport() {
    if (!currentUser) {
        showUnlockOverlay(true);
        return;
    }

    const isPro = currentUserProfile.isPro === true;
    const freeUsed = currentUserProfile.freeProposalsUsed || 0;

    if (!isPro && freeUsed >= 1) {
        showPaywallModal(
            "Limit erreicht",
            "Dein kostenloses Angebot ist aufgebraucht. Upgrade auf Pro (29€/Monat), um unbegrenzt PDFs zu exportieren."
        );
        return;
    }

    const exportBtn = document.getElementById('exportBtn');
    setButtonLoading(exportBtn, true, 'Erstelle PDF...');

    const element = document.getElementById('export-document');
    const clientName = (document.getElementById('clientName').value.trim() || 'Kunde').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Proposal_${clientName}_${dateStr}.pdf`;

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

        if (!isPro && isFirebaseReady && currentUser) {
            const docTypeVal = document.getElementById('documentTypeSelect')?.value || 'proposal';
            const headers = await getAuthHeaders();
            await fetch('/api/track-export', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ documentType: docTypeVal })
            }).catch(console.warn);

            if (!currentUserProfile.freeProposalsUsedByDocType) {
                currentUserProfile.freeProposalsUsedByDocType = {};
            }
            currentUserProfile.freeProposalsUsedByDocType[docTypeVal] = (currentUserProfile.freeProposalsUsedByDocType[docTypeVal] || 0) + 1;
            updatePlanBadge();
        }
    } catch (error) {
        console.error("PDF Export Fehler:", error);
        alert("Beim PDF-Export ist ein Fehler aufgetreten.");
    } finally {
        const dict = i18nDictionary[selectedLanguage] || i18nDictionary.de;
        setButtonLoading(exportBtn, false, `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg><span id="exportPdfBtnText">${dict.exportBtnText}</span>`);
    }
}

// =============================================================================
// 16. STRIPE PAYWALL MODAL
// =============================================================================
let paywallBillingCycle = 'monthly';

// =============================================================================
// PRIVACY SETTINGS & DATA EXPORT (DSGVO)
// =============================================================================
function bindPrivacyEvents() {
    const headerPrivacySettingsBtn = document.getElementById('headerPrivacySettingsBtn');
    const openPrivacySettingsBtn = document.getElementById('openPrivacySettingsBtn');
    const privacySettingsModal = document.getElementById('privacySettingsModal');
    const closePrivacySettingsBtn = document.getElementById('closePrivacySettingsBtn');
    
    const exportDataBtn = document.getElementById('exportDataBtn');
    const exportDataSpinner = document.getElementById('exportDataSpinner');
    const privacyDeleteAccountBtn = document.getElementById('privacyDeleteAccountBtn');
    const deleteAccountConfirmModal = document.getElementById('deleteAccountConfirmModal');

    function openPrivacyModal() {
        if (!privacySettingsModal) return;
        privacySettingsModal.classList.remove('hidden');
        setTimeout(() => privacySettingsModal.classList.remove('opacity-0'), 10);
    }

    function closePrivacyModal() {
        if (!privacySettingsModal) return;
        privacySettingsModal.classList.add('opacity-0');
        setTimeout(() => privacySettingsModal.classList.add('hidden'), 300);
    }

    if (headerPrivacySettingsBtn) headerPrivacySettingsBtn.addEventListener('click', openPrivacyModal);
    if (openPrivacySettingsBtn) openPrivacySettingsBtn.addEventListener('click', openPrivacyModal);
    if (closePrivacySettingsBtn) closePrivacySettingsBtn.addEventListener('click', closePrivacyModal);

    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', async () => {
            const user = firebase.auth().currentUser;
            if (!user) {
                alert("Bitte melden Sie sich an, um Daten zu exportieren.");
                return;
            }
            
            if(exportDataSpinner) exportDataSpinner.classList.remove('hidden');
            exportDataBtn.disabled = true;

            try {
                const headers = await getAuthHeaders();
                const response = await fetch('/api/user/export', { headers });
                const exportPayload = await response.json();
                if (!response.ok || !exportPayload.success) {
                    throw new Error(exportPayload.message || exportPayload.error || 'Datenexport fehlgeschlagen.');
                }

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", "AgencyOS_Datenauskunft_" + user.uid + ".json");
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                
            } catch (error) {
                console.error("Fehler beim Datenexport:", error);
                alert("Fehler beim Datenexport: " + error.message);
            } finally {
                if(exportDataSpinner) exportDataSpinner.classList.add('hidden');
                exportDataBtn.disabled = false;
            }
        });
    }

    if (privacyDeleteAccountBtn) {
        privacyDeleteAccountBtn.addEventListener('click', () => {
            closePrivacyModal();
            if (deleteAccountConfirmModal) {
                deleteAccountConfirmModal.classList.remove('hidden');
                setTimeout(() => deleteAccountConfirmModal.classList.remove('opacity-0'), 10);
            }
        });
    }
}

function bindPaywallEvents() {
    const paywallModal = document.getElementById('paywallModal');
    const closePaywallBtn = document.getElementById('closePaywallBtn');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const upgradeHeaderBtn = document.getElementById('upgradeHeaderBtn');
    const billingCycleMonthly = document.getElementById('billingCycleMonthly');
    const billingCycleYearly = document.getElementById('billingCycleYearly');
    const paywallPriceValue = document.getElementById('paywallPriceValue');
    const paywallPricePeriod = document.getElementById('paywallPricePeriod');

    billingCycleMonthly?.addEventListener('click', () => {
        paywallBillingCycle = 'monthly';
        billingCycleMonthly.className = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all';
        if (billingCycleYearly) {
            billingCycleYearly.className = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1';
        }
        if (paywallPriceValue) paywallPriceValue.textContent = '29 €';
        if (paywallPricePeriod) paywallPricePeriod.textContent = ' / Monat (zzgl. MwSt.)';
    });

    billingCycleYearly?.addEventListener('click', () => {
        paywallBillingCycle = 'yearly';
        billingCycleYearly.className = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white transition-all flex items-center justify-center gap-1';
        if (billingCycleMonthly) {
            billingCycleMonthly.className = 'flex-1 text-center py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all';
        }
        if (paywallPriceValue) paywallPriceValue.textContent = '290 €';
        if (paywallPricePeriod) paywallPricePeriod.textContent = ' / Jahr (zzgl. MwSt.)';
    });

    closePaywallBtn.addEventListener('click', hidePaywallModal);
    upgradeHeaderBtn?.addEventListener('click', () => showPaywallModal());
    upgradeBtn.addEventListener('click', triggerStripeCheckout);

    const paywallAcceptLegals = document.getElementById('paywallAcceptLegals');
    paywallAcceptLegals?.addEventListener('change', (e) => {
        if (e.target.checked) {
            upgradeBtn.disabled = false;
            upgradeBtn.className = "w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 transition-all flex justify-center items-center gap-2 text-sm";
        } else {
            upgradeBtn.disabled = true;
            upgradeBtn.className = "w-full bg-slate-700 text-slate-400 cursor-not-allowed font-bold py-3.5 rounded-xl transition-all flex justify-center items-center gap-2 text-sm";
        }
    });
}

function showPaywallModal(customTitle, customDesc) {
    const modal = document.getElementById('paywallModal');
    const titleEl = document.getElementById('paywallTitle');
    const descEl = document.getElementById('paywallDescription');
    const upgradeBtn = document.getElementById('upgradeBtn');
    const paywallAcceptLegals = document.getElementById('paywallAcceptLegals');

    if (paywallAcceptLegals) {
        paywallAcceptLegals.checked = false;
    }
    if (upgradeBtn) {
        upgradeBtn.disabled = true;
        upgradeBtn.className = "w-full bg-slate-700 text-slate-400 cursor-not-allowed font-bold py-3.5 rounded-xl transition-all flex justify-center items-center gap-2 text-sm";
    }

    if (customTitle && titleEl) titleEl.textContent = customTitle;
    if (customDesc && descEl) descEl.textContent = customDesc;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function hidePaywallModal() {
    const modal = document.getElementById('paywallModal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function triggerStripeCheckout() {
    const upgradeBtn = document.getElementById('upgradeBtn');
    setButtonLoading(upgradeBtn, true, 'Leite zu Stripe weiter...');

    try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
        const headers = await getAuthHeaders();
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                userId: currentUser ? currentUser.uid : 'anonymous',
                userEmail: currentUser ? currentUser.email : '',
                timezone: userTimezone,
                billingCycle: paywallBillingCycle
            })
        });

        const data = await response.json();
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error(data.error || 'Keine Checkout-URL erhalten.');
        }
    } catch (error) {
        console.error("Stripe Fehler:", error);
        alert("Fehler bei der Weiterleitung zu Stripe: " + error.message);
        setButtonLoading(upgradeBtn, false, 'Upgrade auf Pro freischalten');
    }
}

// =============================================================================
// 17. ACCOUNT-, PROFIL-, BILLING-PORTAL & DSGVO-LÖSCHUNG
// =============================================================================
function bindProfileEvents() {
    const profileModalBtn = document.getElementById('profileModalBtn');
    const profileModal = document.getElementById('profileModal');
    const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
    const profileForm = document.getElementById('profileForm');
    const quickSaveProfileBtn = document.getElementById('quickSaveProfileBtn');

    // Tabs
    const tabBtnProfile = document.getElementById('tabBtnProfile');
    const tabBtnBranding = document.getElementById('tabBtnBranding');
    const tabBtnBilling = document.getElementById('tabBtnBilling');
    const tabBtnDanger = document.getElementById('tabBtnDanger');
    const tabContentProfile = document.getElementById('tabContentProfile');
    const tabContentBranding = document.getElementById('tabContentBranding');
    const tabContentBilling = document.getElementById('tabContentBilling');
    const tabContentDanger = document.getElementById('tabContentDanger');

    // Branding Elements
    const brandingForm = document.getElementById('brandingForm');
    const cancelBrandingBtn = document.getElementById('cancelBrandingBtn');
    const modalBrandColorPicker = document.getElementById('modalBrandColorPicker');
    const modalBrandColor = document.getElementById('modalBrandColor');
    const saveBrandingBtn = document.getElementById('saveBrandingBtn');

    // Customer Portal & Delete Account Elements
    const openStripePortalBtn = document.getElementById('openStripePortalBtn');
    const triggerDeleteAccountModalBtn = document.getElementById('triggerDeleteAccountModalBtn');
    const deleteAccountConfirmModal = document.getElementById('deleteAccountConfirmModal');
    const confirmDeleteAccountBtn = document.getElementById('confirmDeleteAccountBtn');
    const cancelDeleteAccountBtn = document.getElementById('cancelDeleteAccountBtn');
    const deleteAccountSpinner = document.getElementById('deleteAccountSpinner');
    const deleteAccountBtnText = document.getElementById('deleteAccountBtnText');

    function switchTab(activeTab) {
        // Reset Tab Buttons
        [tabBtnProfile, tabBtnBranding, tabBtnBilling, tabBtnDanger].forEach(btn => {
            btn?.classList.remove('bg-slate-800', 'text-blue-400', 'text-red-400', 'border-slate-700');
            btn?.classList.add('text-slate-400', 'border-transparent');
        });

        // Hide all contents
        tabContentProfile?.classList.add('hidden');
        tabContentBranding?.classList.add('hidden');
        tabContentBilling?.classList.add('hidden');
        tabContentDanger?.classList.add('hidden');

        if (activeTab === 'profile') {
            tabBtnProfile?.classList.add('bg-slate-800', 'text-blue-400', 'border-slate-700');
            tabBtnProfile?.classList.remove('text-slate-400', 'border-transparent');
            tabContentProfile?.classList.remove('hidden');
        } else if (activeTab === 'branding') {
            tabBtnBranding?.classList.add('bg-slate-800', 'text-blue-400', 'border-slate-700');
            tabBtnBranding?.classList.remove('text-slate-400', 'border-transparent');
            tabContentBranding?.classList.remove('hidden');
        } else if (activeTab === 'billing') {
            tabBtnBilling?.classList.add('bg-slate-800', 'text-blue-400', 'border-slate-700');
            tabBtnBilling?.classList.remove('text-slate-400', 'border-transparent');
            tabContentBilling?.classList.remove('hidden');
        } else if (activeTab === 'danger') {
            tabBtnDanger?.classList.add('bg-red-500/10', 'text-red-400', 'border-red-500/20');
            tabBtnDanger?.classList.remove('text-slate-400', 'border-transparent');
            tabContentDanger?.classList.remove('hidden');
        }
    }

    tabBtnProfile?.addEventListener('click', () => switchTab('profile'));
    tabBtnBranding?.addEventListener('click', () => switchTab('branding'));
    tabBtnBilling?.addEventListener('click', () => switchTab('billing'));
    tabBtnDanger?.addEventListener('click', () => switchTab('danger'));

    // Color picker syncing
    modalBrandColorPicker?.addEventListener('input', (e) => {
        if (modalBrandColor) modalBrandColor.value = e.target.value;
    });
    modalBrandColor?.addEventListener('input', (e) => {
        if (modalBrandColorPicker && /^#[0-9A-F]{6}$/i.test(e.target.value)) {
            modalBrandColorPicker.value = e.target.value;
        }
    });

    const updateProfileModalData = () => {
        // Populate Stammdaten
        document.getElementById('modalAgencyName').value = currentUserProfile.agencyName || document.getElementById('agencyName').value;
        document.getElementById('modalAgencyEmail').value = currentUserProfile.agencyEmail || document.getElementById('agencyEmail').value;
        document.getElementById('modalAgencyPhone').value = currentUserProfile.agencyPhone || '';
        document.getElementById('modalAgencyAddress').value = currentUserProfile.agencyAddress || '';

        // Populate Branding & Domain
        const customDomainInput = document.getElementById('modalCustomDomain');
        const brandColorInput = document.getElementById('modalBrandColor');
        const brandColorPicker = document.getElementById('modalBrandColorPicker');
        const brandLogoUrlInput = document.getElementById('modalBrandLogoUrl');
        const hideBrandingCheckbox = document.getElementById('modalHideBranding');

        if (customDomainInput) customDomainInput.value = currentUserProfile.customDomain || '';
        if (brandColorInput) brandColorInput.value = currentUserProfile.brandColor || '#2563eb';
        if (brandColorPicker) brandColorPicker.value = currentUserProfile.brandColor || '#2563eb';
        if (brandLogoUrlInput) brandLogoUrlInput.value = currentUserProfile.brandLogoUrl || currentUserProfile.logoUrl || '';
        if (hideBrandingCheckbox) hideBrandingCheckbox.checked = currentUserProfile.hideBranding === true;

        // Populate Billing Data
        const profilePlanTitle = document.getElementById('profilePlanTitle');
        const profilePlanBadge = document.getElementById('profilePlanBadge');
        const profilePlanStatus = document.getElementById('profilePlanStatus');
        const profileAccountEmail = document.getElementById('profileAccountEmail');
        const profilePlanIcon = document.getElementById('profilePlanIcon');

        if (profileAccountEmail) {
            profileAccountEmail.textContent = (currentUser && currentUser.email) || currentUserProfile.agencyEmail || '-';
        }

        if (currentUserProfile.isPro) {
            if (profilePlanTitle) profilePlanTitle.textContent = 'AgencyOS PRO ✨';
            if (profilePlanBadge) {
                profilePlanBadge.textContent = 'PRO AKTIV';
                profilePlanBadge.className = 'text-[10px] font-extrabold bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full';
            }
            if (profilePlanStatus) {
                profilePlanStatus.textContent = 'Aktiv (Unbegrenzte KI-Generierungen, White-Labeling, E-Sign & Webhooks)';
                profilePlanStatus.className = 'font-semibold text-emerald-400';
            }
            if (profilePlanIcon) {
                profilePlanIcon.className = 'w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400';
            }
        } else {
            if (profilePlanTitle) profilePlanTitle.textContent = 'AgencyOS Kostenlos';
            if (profilePlanBadge) {
                profilePlanBadge.textContent = 'FREE TIER';
                profilePlanBadge.className = 'text-[10px] font-extrabold bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full';
            }
            if (profilePlanStatus) {
                profilePlanStatus.textContent = `${currentUserProfile.freeProposalsUsed || 0} von 1 Dokument genutzt`;
                profilePlanStatus.className = 'font-medium text-slate-300';
            }
            if (profilePlanIcon) {
                profilePlanIcon.className = 'w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400';
            }
        }
    };

    const openModal = (initialTab = 'profile') => {
        updateProfileModalData();
        switchTab(initialTab);
        profileModal.classList.remove('hidden');
        setTimeout(() => profileModal.classList.remove('opacity-0'), 10);
    };

    const closeModal = () => {
        profileModal.classList.add('opacity-0');
        setTimeout(() => profileModal.classList.add('hidden'), 300);
    };

    profileModalBtn?.addEventListener('click', () => openModal('profile'));
    closeProfileModalBtn?.addEventListener('click', closeModal);
    cancelProfileBtn?.addEventListener('click', closeModal);
    cancelBrandingBtn?.addEventListener('click', closeModal);

    // Save Profile Form
    profileForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const agencyName = document.getElementById('modalAgencyName').value.trim();
        const agencyEmail = document.getElementById('modalAgencyEmail').value.trim();
        const agencyPhone = document.getElementById('modalAgencyPhone').value.trim();
        const agencyAddress = document.getElementById('modalAgencyAddress').value.trim();

        try {
            await saveUserProfileData({ agencyName, agencyEmail, agencyPhone, agencyAddress });
            closeModal();
        } catch (error) {
            alert('Fehler beim Speichern des Profils: ' + error.message);
        }
    });

    // Save Branding & Custom Domain Form (Feature 1)
    brandingForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const customDomain = document.getElementById('modalCustomDomain')?.value.trim() || '';
        const brandColor = document.getElementById('modalBrandColor')?.value.trim() || '#2563eb';
        const brandLogoUrl = document.getElementById('modalBrandLogoUrl')?.value.trim() || '';
        const hideBranding = document.getElementById('modalHideBranding')?.checked || false;

        const saveBtn = document.getElementById('saveBrandingBtn');
        setButtonLoading(saveBtn, true, 'Speichere...');

        try {
            const headers = await getAuthHeaders();
            const response = await fetch('/api/user/custom-domain', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    customDomain,
                    brandColor,
                    brandLogoUrl,
                    hideBranding
                })
            });

            if (response.status === 403) {
                const errData = await response.json();
                showPaywallModal("Pro-Feature erforderlich", errData.message);
                return;
            }

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Fehler beim Speichern der Domain.');
            }

            await saveUserProfileData({
                customDomain,
                brandColor,
                brandLogoUrl,
                hideBranding
            });

            alert("✓ White-Labeling & Domain-Einstellungen erfolgreich gespeichert!");
            closeModal();
        } catch (err) {
            console.error("Custom domain save error:", err);
            alert("Fehler beim Speichern: " + err.message);
        } finally {
            setButtonLoading(saveBtn, false, '<span>Branding & Domain speichern</span>');
        }
    });

    quickSaveProfileBtn?.addEventListener('click', async () => {
        const agencyName = document.getElementById('agencyName').value.trim();
        const agencyEmail = document.getElementById('agencyEmail').value.trim();
        await saveUserProfileData({ agencyName, agencyEmail });
        quickSaveProfileBtn.textContent = "Gespeichert!";
        setTimeout(() => quickSaveProfileBtn.textContent = "In Profil sichern", 2000);
    });

    // -------------------------------------------------------------------------
    // Stripe Customer Portal Trigger (Abo & Rechnungen)
    // -------------------------------------------------------------------------
    openStripePortalBtn?.addEventListener('click', async () => {
        const originalText = openStripePortalBtn.innerHTML;
        openStripePortalBtn.disabled = true;
        openStripePortalBtn.innerHTML = `
            <div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
            <span>Öffne Stripe Portal...</span>
        `;

        try {
            const headers = await getAuthHeaders();
            const response = await fetch('/api/create-customer-portal-session', {
                method: 'POST',
                headers: headers
            });

            const data = await response.json();

            if (data.success && data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.message || data.error || 'Konnte Portal nicht öffnen.');
            }
        } catch (error) {
            console.error('Fehler beim Öffnen des Stripe Customer Portals:', error);
            alert('Fehler beim Öffnen des Kundenportals: ' + error.message);
            openStripePortalBtn.disabled = false;
            openStripePortalBtn.innerHTML = originalText;
        }
    });

    // -------------------------------------------------------------------------
    // DSGVO-Account-Löschung (Zero-Ghost-Billing) Flow
    // -------------------------------------------------------------------------
    const openDeleteConfirmModal = () => {
        deleteAccountConfirmModal?.classList.remove('hidden');
        setTimeout(() => deleteAccountConfirmModal?.classList.remove('opacity-0'), 10);
    };

    const closeDeleteConfirmModal = () => {
        deleteAccountConfirmModal?.classList.add('opacity-0');
        setTimeout(() => deleteAccountConfirmModal?.classList.add('hidden'), 300);
    };

    triggerDeleteAccountModalBtn?.addEventListener('click', openDeleteConfirmModal);
    cancelDeleteAccountBtn?.addEventListener('click', closeDeleteConfirmModal);

    confirmDeleteAccountBtn?.addEventListener('click', async () => {
        confirmDeleteAccountBtn.disabled = true;
        deleteAccountBtnText.textContent = "Lösche Daten & storniere Abonnements...";
        deleteAccountSpinner.classList.remove('hidden');

        try {
            const headers = await getAuthHeaders();
            const response = await fetch('/api/delete-account', {
                method: 'POST',
                headers: headers
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Fehler beim Löschen des Accounts.');
            }

            console.log('✅ Account erfolgreich gelöscht:', result);

            closeDeleteConfirmModal();
            closeModal();

            // Firebase Auth abmelden
            if (auth) {
                await auth.signOut();
            }

            alert('✓ Dein Account, alle Abonnements und persönlichen Daten wurden erfolgreich und unwiderruflich gelöscht. Eine Bestätigungs-E-Mail wurde an deine Adresse gesendet.');
            window.location.href = '/index.html';
        } catch (delError) {
            console.error('❌ Fehler bei der Account-Löschung:', delError);
            alert('Fehler beim Löschen des Accounts: ' + delError.message);
            confirmDeleteAccountBtn.disabled = false;
            deleteAccountBtnText.textContent = "Ja, Account jetzt unwiderruflich löschen";
            deleteAccountSpinner.classList.add('hidden');
        }
    });

    // Expose openModal globally for external links/buttons
    window.openProfileSettingsModal = openModal;
}

async function saveUserProfileData(data) {
    if (!isFirebaseReady || !currentUser) {
        throw new Error('Bitte melde dich zuerst an.');
    }

    const headers = await getAuthHeaders();
    const response = await fetch('/api/user/profile', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || 'Profil konnte nicht gespeichert werden.');
    }

    currentUserProfile = { ...currentUserProfile, ...(result.profile || data) };
    applyProfileToUI();
    return currentUserProfile;
}

// =============================================================================
// 18. URL PARAMETERS & HELPER UTILITIES
// =============================================================================
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        const banner = document.getElementById('paymentSuccessBanner');
        if (banner) {
            banner.classList.remove('hidden');
            document.getElementById('closeBannerBtn')?.addEventListener('click', () => banner.classList.add('hidden'));
        }

        // The client never grants Pro from a redirect alone. Stripe's signed
        // webhook must update the shared Firestore entitlement first.
        updatePlanBadge();
    }

    if (urlParams.get('openSettings') === 'billing' || urlParams.get('portal') === 'returned') {
        setTimeout(() => {
            if (typeof window.openProfileSettingsModal === 'function') {
                window.openProfileSettingsModal('billing');
            }
        }, 500);
    }
}

function getReadableErrorMessage(error) {
    if (!error || !error.code) return error.message || "Ein Fehler ist aufgetreten.";
    switch (error.code) {
        case 'auth/email-already-in-use': return "Diese E-Mail-Adresse ist bereits registriert. Bitte wähle 'Anmelden'.";
        case 'auth/invalid-email': return "Ungültige E-Mail-Adresse.";
        case 'auth/weak-password': return "Das Passwort muss mindestens 6 Zeichen lang sein.";
        case 'auth/user-not-found': return "Kein Account mit dieser E-Mail gefunden.";
        case 'auth/wrong-password': return "Falsches Passwort.";
        case 'auth/invalid-credential': return "E-Mail oder Passwort ist ungültig.";
        default: return error.message;
    }
}

function setButtonLoading(btn, isLoading, defaultText) {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div><span>${defaultText}</span>`;
    } else {
        btn.disabled = false;
        btn.innerHTML = defaultText;
    }
}

// =============================================================================
// 19. FEATURE 3: KI-DEAL-SCORING & OPTIMIERUNGS-ENGINE (GEMINI 1.5 PRO)
// =============================================================================
function bindDealScoreEvents() {
    const openDealScoreBtn = document.getElementById('openDealScoreBtn');
    const dealScoreModal = document.getElementById('dealScoreModal');
    const closeDealScoreModalBtn = document.getElementById('closeDealScoreModalBtn');
    const closeDealScoreModalBottomBtn = document.getElementById('closeDealScoreModalBottomBtn');
    const dealScoreLoading = document.getElementById('dealScoreLoading');
    const dealScoreContent = document.getElementById('dealScoreContent');

    const openModal = () => {
        dealScoreModal?.classList.remove('hidden');
        setTimeout(() => {
            dealScoreModal?.classList.remove('opacity-0');
            dealScoreModal?.querySelector('div')?.classList.remove('scale-95');
        }, 10);
    };

    const closeModal = () => {
        dealScoreModal?.classList.add('opacity-0');
        dealScoreModal?.querySelector('div')?.classList.add('scale-95');
        setTimeout(() => dealScoreModal?.classList.add('hidden'), 300);
    };

    closeDealScoreModalBtn?.addEventListener('click', closeModal);
    closeDealScoreModalBottomBtn?.addEventListener('click', closeModal);

    openDealScoreBtn?.addEventListener('click', async () => {
        const textContent = document.getElementById('aiTextContent')?.innerText?.trim() || '';
        const client = document.getElementById('clientName')?.value.trim() || 'Schmidt & Partner';
        const category = document.getElementById('projectCategory')?.value.trim() || 'Projektangebot';
        const deliverables = document.getElementById('projectDeliverables')?.value.trim() || '';
        const budget = document.getElementById('projectBudget')?.value.trim() || '4.500 €';

        if (!textContent || textContent.length < 50) {
            alert("Bitte generiere zuerst ein vollständiges Angebot mit der KI, um ein Deal-Scoring durchzuführen.");
            return;
        }

        openModal();
        dealScoreLoading?.classList.remove('hidden');
        dealScoreContent?.classList.add('hidden');

        try {
            const headers = await getAuthHeaders();
            const response = await fetch('/api/proposals/deal-score', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    clientName: client,
                    category: category,
                    deliverables: deliverables,
                    budget: budget,
                    proposalText: textContent,
                    language: selectedLanguage
                })
            });

            if (response.status === 403) {
                closeModal();
                const errData = await response.json();
                showPaywallModal("Pro-Feature erforderlich", errData.message);
                return;
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || 'Fehler beim Abrufen des KI-Deal-Scores.');
            }

            const data = await response.json();
            renderDealScoreResults(data);

            dealScoreLoading?.classList.add('hidden');
            dealScoreContent?.classList.remove('hidden');

        } catch (err) {
            console.error("Deal score error:", err);
            dealScoreLoading?.classList.add('hidden');
            alert("Fehler bei der Deal-Scoring Analyse: " + err.message);
            closeModal();
        }
    });
}

function renderDealScoreResults(data) {
    const scoreVal = data.score || 85;
    
    // Animate Score Value
    const scoreTextEl = document.getElementById('dealScoreValue');
    if (scoreTextEl) scoreTextEl.textContent = scoreVal;

    // SVG Ring Gauge Animation
    const circle = document.getElementById('dealScoreCircle');
    if (circle) {
        const circumference = 301.6;
        const offset = circumference - (circumference * (scoreVal / 100));
        setTimeout(() => {
            circle.style.strokeDashoffset = offset;
        }, 100);
    }

    // Win Probability & Verdict
    const probBadge = document.getElementById('dealWinProbabilityBadge');
    const probText = document.getElementById('dealWinProbabilityText');
    const headline = document.getElementById('dealHeadlineVerdict');
    const summary = document.getElementById('dealSummaryVerdict');

    if (probText) probText.textContent = `Abschlusschance: ${data.winProbability || 'Sehr Hoch'}`;
    if (headline) headline.textContent = data.verdictHeadline || 'Ausgezeichnete Abschlusschancen';
    if (summary) summary.textContent = data.verdictSummary || 'Das Angebot überzeugt durch klare Argumentation und transparente Leistungsphasen.';

    // Metrics Breakdown Bars
    const metrics = data.metrics || { valueClarity: 85, pricingPower: 80, riskReduction: 75, ctaStrength: 90 };
    
    const setMetric = (valId, barId, val) => {
        const vEl = document.getElementById(valId);
        const bEl = document.getElementById(barId);
        if (vEl) vEl.textContent = `${val}%`;
        if (bEl) bEl.style.width = `${val}%`;
    };

    setMetric('dealMetricValueClarity', 'dealBarValueClarity', metrics.valueClarity || 85);
    setMetric('dealMetricPricingPower', 'dealBarPricingPower', metrics.pricingPower || 80);
    setMetric('dealMetricRiskReduction', 'dealBarRiskReduction', metrics.riskReduction || 75);
    setMetric('dealMetricCtaStrength', 'dealBarCtaStrength', metrics.ctaStrength || 90);

    // Strengths List
    const strengthsList = document.getElementById('dealStrengthsList');
    if (strengthsList && Array.isArray(data.strengths)) {
        strengthsList.innerHTML = data.strengths.map(s => `
            <li class="flex items-start gap-2">
                <span class="text-emerald-400 font-bold shrink-0">✓</span>
                <span>${escapeHtml(s)}</span>
            </li>
        `).join('');
    }

    // Weaknesses List
    const weaknessesList = document.getElementById('dealWeaknessesList');
    if (weaknessesList && Array.isArray(data.weaknesses)) {
        weaknessesList.innerHTML = data.weaknesses.map(w => `
            <li class="flex items-start gap-2">
                <span class="text-amber-400 font-bold shrink-0">⚠️</span>
                <span>${escapeHtml(w)}</span>
            </li>
        `).join('');
    }

    // Recommendations List
    const recList = document.getElementById('dealRecommendationsList');
    if (recList && Array.isArray(data.recommendations)) {
        recList.innerHTML = data.recommendations.map(r => `
            <li class="flex items-start gap-2.5 bg-slate-900/60 p-2.5 rounded-xl border border-purple-500/20">
                <span class="text-purple-400 font-bold text-sm shrink-0">💡</span>
                <span class="leading-relaxed">${escapeHtml(r)}</span>
            </li>
        `).join('');
    }
}

// =========================================================================
// SUPPORT BOT & CANCELLATION BUTTON LOGIC (GERMAN LAW)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cancellation Button (Kündigungsbutton)
    const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
    
    // We only show it if a user is logged in (to manage the subscription)
    // Or we show it always, as per German law it should be accessible.
    if (cancelSubscriptionBtn) {
        cancelSubscriptionBtn.classList.remove('hidden');
        cancelSubscriptionBtn.addEventListener('click', () => {
            // Usually this would redirect to a specific cancellation flow or Stripe portal
            if (currentUser && currentUserProfile.isPro) {
                window.location.hash = 'settings';
                setTimeout(() => {
                    alert('Du wirst zum Stripe Kundenportal weitergeleitet, um dein Abonnement zu kündigen.');
                    const manageBillingBtn = document.getElementById('manageBillingBtn');
                    if (manageBillingBtn) manageBillingBtn.click();
                }, 500);
            } else {
                alert('Es wurde kein aktives Abonnement gefunden. Bitte melde dich an, um Verträge zu kündigen.');
            }
        });
    }

    // 2. Support Bot Logic
    const toggleSupportChatBtn = document.getElementById('toggleSupportChatBtn');
    const closeSupportChatBtn = document.getElementById('closeSupportChatBtn');
    const supportChatWindow = document.getElementById('supportChatWindow');
    const supportChatInput = document.getElementById('supportChatInput');
    const supportChatSendBtn = document.getElementById('supportChatSendBtn');
    const supportChatMessages = document.getElementById('supportChatMessages');

    let chatHistory = [];

    if (toggleSupportChatBtn && supportChatWindow) {
        toggleSupportChatBtn.addEventListener('click', () => {
            supportChatWindow.classList.toggle('hidden');
            supportChatWindow.classList.toggle('flex');
            if (!supportChatWindow.classList.contains('hidden')) {
                supportChatInput.focus();
            }
        });

        closeSupportChatBtn.addEventListener('click', () => {
            supportChatWindow.classList.add('hidden');
            supportChatWindow.classList.remove('flex');
        });

        const appendMessage = (text, isUser) => {
            const div = document.createElement('div');
            div.className = isUser 
                ? 'bg-blue-600 text-white p-2.5 rounded-lg rounded-tr-none self-end max-w-[85%]'
                : 'bg-slate-800 border border-slate-700 text-slate-200 p-2.5 rounded-lg rounded-tl-none self-start max-w-[85%]';
            div.textContent = text;
            supportChatMessages.appendChild(div);
            supportChatMessages.scrollTop = supportChatMessages.scrollHeight;
        };

        const sendMessage = async () => {
            const text = supportChatInput.value.trim();
            if (!text) return;

            appendMessage(text, true);
            supportChatInput.value = '';
            
            // Show typing indicator
            const typingDiv = document.createElement('div');
            typingDiv.className = 'text-slate-400 text-xs italic self-start mb-2';
            typingDiv.textContent = 'Bot schreibt...';
            supportChatMessages.appendChild(typingDiv);

            try {
                const response = await fetch(`${API_BASE_URL}/api/support-chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text, history: chatHistory })
                });

                typingDiv.remove();

                if (response.ok) {
                    const data = await response.json();
                    appendMessage(data.reply, false);
                    chatHistory.push({ role: 'user', content: text });
                    chatHistory.push({ role: 'model', content: data.reply });
                } else {
                    appendMessage('Entschuldigung, es gab einen Fehler.', false);
                }
            } catch (err) {
                typingDiv.remove();
                appendMessage('Netzwerkfehler. Bitte versuche es später noch einmal.', false);
            }
        };

        supportChatSendBtn.addEventListener('click', sendMessage);
        supportChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
});
