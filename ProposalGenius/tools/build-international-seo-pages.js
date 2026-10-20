const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const origin = 'https://agencyos.com';

const locales = [
    {
        lang: 'de', slug: '', label: 'Deutsch', htmlLocale: 'de_DE',
        title: 'KI-Angebotssoftware für Agenturen & Freelancer | AgencyOS',
        description: 'Erstelle mit AgencyOS KI-gestützte Angebote, Briefings, Verträge und Projekt-Roadmaps. Prüfe den Entwurf, passe ihn an und exportiere ein PDF.',
        eyebrow: 'Angebotssoftware für Dienstleister',
        h1: 'KI-Angebotssoftware für Agenturen und Freelancer',
        lead: 'AgencyOS ist eine browserbasierte Anwendung, mit der Selbstständige und Agenturen aus Projekt-Notizen strukturierte Kundenangebote und Geschäftsdokumente erstellen, bearbeiten und als PDF exportieren können.',
        navLabel: 'Sprache auswählen', cta: 'Dokument erstellen',
        howTitle: 'So erstellen Sie ein Kundenangebot',
        steps: [
            ['Projekt beschreiben:', 'Tragen Sie Kunde, Projektziele, Leistungen, Budget und Zeitrahmen ein oder wählen Sie eine passende Vorlage.'],
            ['Entwurf erstellen und prüfen:', 'Erzeugen Sie einen bearbeitbaren Entwurf für den gewünschten Dokumenttyp. Prüfen Sie Namen, Beträge, Termine und Vertragsangaben und passen Sie den Text an.'],
            ['Exportieren oder freigeben:', 'Laden Sie das Dokument als PDF herunter. Pro enthält Freigabe-Links und Funktionen für elektronische Signaturen.']
        ],
        docsTitle: 'Welche Dokumente kann AgencyOS erstellen?',
        docsIntro: 'Wählen Sie den passenden Dokumenttyp für Ihren Kundenprozess:',
        docs: ['Projektangebote und Leistungsbeschreibungen', 'Projekt-Briefings und Anforderungsanalysen', 'Dienstleistungsverträge und Leistungsbeschreibungen (SOW)', 'Projekt-Roadmaps und Onboarding-Unterlagen', 'Abnahmeprotokolle und Rechnungen'],
        audience: 'Vorlagen unterstützen typische Projekte in Webdesign, SEO, E-Commerce, Branding und Softwareentwicklung. Die Texte bleiben vor dem PDF-Export bearbeitbar.',
        languageTitle: 'Dokumententwürfe in mehreren Sprachen',
        languageText: 'Für den erzeugten Dokumenttext stehen Deutsch, Englisch, Bahasa Indonesia, vereinfachtes und traditionelles Chinesisch, Japanisch, Französisch und Spanisch zur Auswahl. Die Produktoberfläche ist derzeit auf Deutsch verfügbar.',
        faqTitle: 'Häufige Fragen zu AgencyOS',
        faq: [
            ['Kann ich AgencyOS ohne Registrierung ausprobieren?', 'Ja. Im Gastmodus können Sie zunächst ein Dokument kostenlos erstellen.'],
            ['Kann ich einen KI-Entwurf bearbeiten?', 'Ja. Prüfen und bearbeiten Sie Kundenangaben, Leistungen, Budget und Zeitplan, bevor Sie das Dokument exportieren oder teilen.'],
            ['Kann ich Dokumente digital freigeben lassen?', 'Freigabe-Links und E-Signatur sind Pro-Funktionen.'],
            ['Ist ein KI-Entwurf eine Rechtsberatung?', 'Nein. Der Entwurf ist eine Arbeitshilfe. Prüfen Sie fachliche Angaben, Preise, Fristen und rechtliche Bestimmungen vor dem Versand.']
        ],
        legalLabel: 'Impressum', privacyLabel: 'Datenschutz', termsLabel: 'AGB'
    },
    {
        lang: 'en', slug: 'en', label: 'English', htmlLocale: 'en_US',
        title: 'AI Proposal Generator for Agencies & Freelancers | AgencyOS',
        description: 'Turn project notes into editable proposals and business documents with AgencyOS. Review each draft, make changes and export a client-ready PDF.',
        eyebrow: 'Proposal software for service businesses',
        h1: 'AI proposal software for agencies and freelancers',
        lead: 'AgencyOS is a browser-based tool that turns project notes into editable client proposals and related business documents. Refine the draft and export it as a PDF.',
        navLabel: 'Choose language', cta: 'Create a document',
        howTitle: 'How to create a client proposal',
        steps: [
            ['Add the project brief:', 'Enter the client, project goals, deliverables, budget and timeline, or start from a relevant template.'],
            ['Generate and review:', 'Create a draft for the document type you selected. Check names, figures, dates and contract terms, then edit anything that needs correction.'],
            ['Export or share:', 'Download the document as a PDF. Pro includes shareable approval links and electronic signature features.']
        ],
        docsTitle: 'What can AgencyOS create?',
        docsIntro: 'Choose the document that fits your client workflow:',
        docs: ['Project proposals and scopes of work', 'Project briefs and requirements analyses', 'Service contracts and statements of work (SOWs)', 'Project roadmaps and onboarding documents', 'Acceptance records and invoices'],
        audience: 'Templates cover common work in web design, SEO, e-commerce, branding and software development. You can edit the text before exporting a PDF.',
        languageTitle: 'Create documents in multiple languages',
        languageText: 'The document language selector includes German, English, Bahasa Indonesia, Simplified and Traditional Chinese, Japanese, French and Spanish. The product interface is currently in German.',
        faqTitle: 'AgencyOS questions and answers',
        faq: [
            ['Can I try AgencyOS without signing up?', 'Yes. Guest mode lets you create one document before creating an account.'],
            ['Can I edit an AI-generated draft?', 'Yes. Review and edit the client details, scope, budget and timeline before exporting or sharing the document.'],
            ['Can clients approve and sign documents online?', 'Shareable approval links and electronic signature features are included with Pro.'],
            ['Is an AI-generated contract legal advice?', 'No. Treat the draft as a starting point. Check its facts, prices, dates and legal terms before sending it to a client.']
        ],
        legalLabel: 'Legal notice (German)', privacyLabel: 'Privacy (German)', termsLabel: 'Terms (German)'
    },
    {
        lang: 'fr', slug: 'fr', label: 'Français', htmlLocale: 'fr_FR',
        title: 'Créateur de devis IA pour agences et freelances | AgencyOS',
        description: 'Transformez vos notes de projet en propositions et documents professionnels modifiables avec AgencyOS. Relisez le contenu et exportez un PDF.',
        eyebrow: 'Outil de devis pour les prestataires',
        h1: 'Logiciel de devis et de propositions commerciales avec IA',
        lead: 'AgencyOS est une application Web qui transforme les notes d’un projet en propositions commerciales et autres documents professionnels modifiables, exportables en PDF.',
        navLabel: 'Choisir la langue', cta: 'Créer un document',
        howTitle: 'Comment préparer une proposition client',
        steps: [
            ['Décrivez le projet :', 'Renseignez le client, les objectifs, les livrables, le budget et le calendrier, ou partez d’un modèle adapté.'],
            ['Générez et relisez le brouillon :', 'Choisissez un type de document, puis vérifiez les noms, montants, dates et clauses avant de modifier le texte.'],
            ['Exportez ou partagez :', 'Téléchargez le document en PDF. L’offre Pro comprend des liens de validation et des fonctions de signature électronique.']
        ],
        docsTitle: 'Quels documents AgencyOS peut-il créer ?',
        docsIntro: 'Choisissez le document adapté à votre échange avec le client :',
        docs: ['Propositions de projet et descriptions des prestations', 'Briefs et analyses des besoins', 'Contrats de prestation et descriptifs de mission (SOW)', 'Feuilles de route et documents de démarrage de projet', 'Procès-verbaux de réception et factures'],
        audience: 'Les modèles couvrent des projets de création de sites Web, de SEO, de commerce en ligne, de branding et de développement logiciel. Vous pouvez modifier le texte avant l’export PDF.',
        languageTitle: 'Documents disponibles en plusieurs langues',
        languageText: 'La langue du document généré peut être l’allemand, l’anglais, l’indonésien, le chinois simplifié ou traditionnel, le japonais, le français ou l’espagnol. L’interface du produit est actuellement en allemand.',
        faqTitle: 'Questions fréquentes sur AgencyOS',
        faq: [
            ['Puis-je essayer AgencyOS sans créer de compte ?', 'Oui. Le mode invité permet de créer un document avant l’inscription.'],
            ['Puis-je modifier un brouillon généré par IA ?', 'Oui. Relisez et modifiez les coordonnées, les prestations, le budget et le calendrier avant de l’exporter ou de le partager.'],
            ['Les clients peuvent-ils valider et signer en ligne ?', 'Les liens de validation et les fonctions de signature électronique sont proposés avec Pro.'],
            ['Un contrat généré par IA constitue-t-il un conseil juridique ?', 'Non. Le brouillon est un point de départ. Vérifiez les faits, les prix, les délais et les clauses avant de l’envoyer.']
        ],
        legalLabel: 'Mentions légales (allemand)', privacyLabel: 'Confidentialité (allemand)', termsLabel: 'Conditions (allemand)'
    },
    {
        lang: 'es', slug: 'es', label: 'Español', htmlLocale: 'es_ES',
        title: 'Generador de propuestas con IA para agencias y freelancers | AgencyOS',
        description: 'Convierte notas de proyecto en propuestas y documentos profesionales editables con AgencyOS. Revisa el borrador y expórtalo en PDF.',
        eyebrow: 'Propuestas para empresas de servicios',
        h1: 'Software de propuestas con IA para agencias y freelancers',
        lead: 'AgencyOS es una herramienta web que transforma notas de proyecto en propuestas para clientes y otros documentos de trabajo editables, listos para exportar en PDF.',
        navLabel: 'Elegir idioma', cta: 'Crear un documento',
        howTitle: 'Cómo crear una propuesta para un cliente',
        steps: [
            ['Describe el proyecto:', 'Añade el cliente, los objetivos, las entregas, el presupuesto y el plazo, o empieza con una plantilla adecuada.'],
            ['Genera y revisa el borrador:', 'Elige un tipo de documento. Comprueba nombres, importes, fechas y condiciones, y modifica el texto según sea necesario.'],
            ['Exporta o comparte:', 'Descarga el documento en PDF. Pro incluye enlaces para aprobación y funciones de firma electrónica.']
        ],
        docsTitle: '¿Qué documentos permite crear AgencyOS?',
        docsIntro: 'Elige el documento que corresponda a tu proceso con el cliente:',
        docs: ['Propuestas de proyecto y descripción de servicios', 'Briefings y análisis de requisitos', 'Contratos de servicios y declaraciones de trabajo (SOW)', 'Hojas de ruta y documentos de incorporación', 'Actas de aceptación y facturas'],
        audience: 'Las plantillas cubren trabajos habituales de diseño web, SEO, comercio electrónico, marca y desarrollo de software. Puedes editar el texto antes de exportar el PDF.',
        languageTitle: 'Documentos en varios idiomas',
        languageText: 'Puedes elegir alemán, inglés, indonesio, chino simplificado o tradicional, japonés, francés o español para el texto del documento. La interfaz del producto está actualmente en alemán.',
        faqTitle: 'Preguntas frecuentes sobre AgencyOS',
        faq: [
            ['¿Puedo probar AgencyOS sin registrarme?', 'Sí. El modo invitado permite crear un documento antes de abrir una cuenta.'],
            ['¿Puedo editar un borrador generado con IA?', 'Sí. Revisa y edita los datos del cliente, los servicios, el presupuesto y el plazo antes de exportarlo o compartirlo.'],
            ['¿Los clientes pueden aprobar y firmar documentos en línea?', 'Los enlaces de aprobación y las funciones de firma electrónica están disponibles en Pro.'],
            ['¿Un contrato generado con IA es asesoramiento jurídico?', 'No. El borrador es un punto de partida. Comprueba los datos, precios, fechas y condiciones legales antes de enviarlo.']
        ],
        legalLabel: 'Aviso legal (alemán)', privacyLabel: 'Privacidad (alemán)', termsLabel: 'Condiciones (alemán)'
    },
    {
        lang: 'id', slug: 'id', label: 'Bahasa Indonesia', htmlLocale: 'id_ID',
        title: 'Pembuat Proposal AI untuk Agensi & Freelancer | AgencyOS',
        description: 'Ubah catatan proyek menjadi proposal dan dokumen bisnis yang dapat diedit dengan AgencyOS. Tinjau draf, sesuaikan, lalu ekspor ke PDF.',
        eyebrow: 'Perangkat proposal untuk penyedia jasa',
        h1: 'Pembuat proposal AI untuk agensi dan freelancer',
        lead: 'AgencyOS adalah aplikasi berbasis browser yang mengubah catatan proyek menjadi proposal klien dan dokumen kerja lain yang dapat diedit serta diekspor sebagai PDF.',
        navLabel: 'Pilih bahasa', cta: 'Buat dokumen',
        howTitle: 'Cara membuat proposal untuk klien',
        steps: [
            ['Jelaskan proyek:', 'Masukkan klien, tujuan proyek, hasil kerja, anggaran, dan jadwal, atau mulai dari templat yang sesuai.'],
            ['Buat dan tinjau draf:', 'Pilih jenis dokumen, lalu periksa nama, jumlah, tanggal, dan ketentuan sebelum mengedit teks yang diperlukan.'],
            ['Ekspor atau bagikan:', 'Unduh dokumen sebagai PDF. Paket Pro menyediakan tautan persetujuan dan fitur tanda tangan elektronik.']
        ],
        docsTitle: 'Dokumen apa yang dapat dibuat dengan AgencyOS?',
        docsIntro: 'Pilih dokumen yang sesuai dengan alur kerja bersama klien:',
        docs: ['Proposal proyek dan uraian lingkup pekerjaan', 'Brief proyek dan analisis kebutuhan', 'Kontrak jasa dan pernyataan pekerjaan (SOW)', 'Peta jalan proyek dan dokumen orientasi klien', 'Berita acara serah terima dan faktur'],
        audience: 'Templat mencakup kebutuhan umum di bidang desain web, SEO, e-commerce, branding, dan pengembangan perangkat lunak. Teks dapat diedit sebelum PDF diekspor.',
        languageTitle: 'Dokumen dalam berbagai bahasa',
        languageText: 'Bahasa teks dokumen yang tersedia: Jerman, Inggris, Bahasa Indonesia, Mandarin sederhana atau tradisional, Jepang, Prancis, dan Spanyol. Antarmuka produk saat ini menggunakan bahasa Jerman.',
        faqTitle: 'Pertanyaan umum tentang AgencyOS',
        faq: [
            ['Bisakah saya mencoba AgencyOS tanpa mendaftar?', 'Bisa. Mode tamu memungkinkan Anda membuat satu dokumen sebelum membuat akun.'],
            ['Apakah draf AI bisa diedit?', 'Bisa. Tinjau dan edit data klien, lingkup pekerjaan, anggaran, dan jadwal sebelum mengekspor atau membagikan dokumen.'],
            ['Bisakah klien menyetujui dan menandatangani dokumen secara online?', 'Tautan persetujuan dan fitur tanda tangan elektronik tersedia di Pro.'],
            ['Apakah kontrak dari AI merupakan nasihat hukum?', 'Bukan. Draf adalah titik awal. Periksa fakta, harga, tanggal, dan ketentuan hukum sebelum mengirimkannya.']
        ],
        legalLabel: 'Informasi hukum (bahasa Jerman)', privacyLabel: 'Privasi (bahasa Jerman)', termsLabel: 'Ketentuan (bahasa Jerman)'
    },
    {
        lang: 'zh-Hans', slug: 'zh-hans', label: '简体中文', htmlLocale: 'zh_CN',
        title: 'AgencyOS：面向代理机构与自由职业者的 AI 项目提案工具',
        description: '使用 AgencyOS 将项目笔记整理为可编辑的客户提案和业务文档。检查内容、修改草稿并导出 PDF。',
        eyebrow: '服务型企业的提案工具',
        h1: '面向代理机构与自由职业者的 AI 项目提案工具',
        lead: 'AgencyOS 是一款浏览器应用，可将项目笔记整理成可编辑的客户提案及其他业务文档，并支持导出为 PDF。',
        navLabel: '选择语言', cta: '创建文档',
        howTitle: '如何创建客户提案',
        steps: [
            ['填写项目概要：', '输入客户、项目目标、交付内容、预算和时间安排，或从相关模板开始。'],
            ['生成并检查草稿：', '选择文档类型后生成草稿。请核对姓名、金额、日期和合同条款，再按需修改内容。'],
            ['导出或分享：', '将文档下载为 PDF。Pro 版提供审批链接和电子签名功能。']
        ],
        docsTitle: 'AgencyOS 可以创建哪些文档？',
        docsIntro: '根据客户合作流程选择合适的文档：',
        docs: ['项目提案和服务范围说明', '项目简报和需求分析', '服务合同和工作说明书（SOW）', '项目路线图和入门资料', '验收记录和发票'],
        audience: '模板适用于网页设计、SEO、电子商务、品牌设计和软件开发等常见项目。导出 PDF 前可以编辑文档内容。',
        languageTitle: '支持多种文档语言',
        languageText: '生成的文档正文可选择德语、英语、印度尼西亚语、简体或繁体中文、日语、法语和西班牙语。产品界面目前为德语。',
        faqTitle: 'AgencyOS 常见问题',
        faq: [
            ['可以不注册就试用 AgencyOS 吗？', '可以。访客模式允许您在创建账户前免费制作一份文档。'],
            ['AI 生成的草稿可以编辑吗？', '可以。导出或分享前，请检查并修改客户信息、服务范围、预算和时间安排。'],
            ['客户可以在线审批并签署文档吗？', 'Pro 版包含审批链接和电子签名功能。'],
            ['AI 生成的合同是否构成法律建议？', '不构成。草稿仅供参考。发送前请自行核实事实、价格、日期和法律条款。']
        ],
        legalLabel: '法律信息（德语）', privacyLabel: '隐私（德语）', termsLabel: '条款（德语）'
    },
    {
        lang: 'zh-Hant', slug: 'zh-hant', label: '繁體中文', htmlLocale: 'zh_TW',
        title: 'AgencyOS：為代理商與自由工作者打造的 AI 專案提案工具',
        description: '使用 AgencyOS 將專案筆記整理成可編輯的客戶提案與商務文件。檢查內容、修改草稿並匯出 PDF。',
        eyebrow: '服務型企業的提案工具',
        h1: '為代理商與自由工作者打造的 AI 專案提案工具',
        lead: 'AgencyOS 是一款瀏覽器應用程式，可將專案筆記整理成可編輯的客戶提案及其他商務文件，並支援匯出為 PDF。',
        navLabel: '選擇語言', cta: '建立文件',
        howTitle: '如何建立客戶提案',
        steps: [
            ['填寫專案簡介：', '輸入客戶、專案目標、交付內容、預算與時程，或從合適的範本開始。'],
            ['產生並檢查草稿：', '選擇文件類型後產生草稿。請核對姓名、金額、日期與合約條款，再依需求修改內容。'],
            ['匯出或分享：', '將文件下載為 PDF。Pro 版提供核准連結與電子簽名功能。']
        ],
        docsTitle: 'AgencyOS 可以建立哪些文件？',
        docsIntro: '依照客戶合作流程選擇合適的文件：',
        docs: ['專案提案與服務範圍說明', '專案簡介與需求分析', '服務合約與工作說明書（SOW）', '專案路線圖與導入文件', '驗收紀錄與發票'],
        audience: '範本涵蓋網頁設計、SEO、電子商務、品牌設計與軟體開發等常見專案。匯出 PDF 前可編輯文件內容。',
        languageTitle: '支援多種文件語言',
        languageText: '生成文件正文可選擇德文、英文、印尼文、簡體或繁體中文、日文、法文與西班牙文。產品介面目前提供德文。',
        faqTitle: 'AgencyOS 常見問題',
        faq: [
            ['可以不註冊就試用 AgencyOS 嗎？', '可以。訪客模式允許您在建立帳戶前免費建立一份文件。'],
            ['AI 產生的草稿可以編輯嗎？', '可以。匯出或分享前，請檢查並修改客戶資料、服務範圍、預算與時程。'],
            ['客戶可以在線上核准並簽署文件嗎？', 'Pro 版包含核准連結與電子簽名功能。'],
            ['AI 產生的合約是否構成法律建議？', '不是。草稿僅供參考。寄送前請自行核實事實、價格、日期與法律條款。']
        ],
        legalLabel: '法律資訊（德文）', privacyLabel: '隱私（德文）', termsLabel: '條款（德文）'
    },
    {
        lang: 'ja', slug: 'ja', label: '日本語', htmlLocale: 'ja_JP',
        title: 'AgencyOS｜代理店・フリーランス向けAI提案書作成ツール',
        description: 'AgencyOSでプロジェクトメモから編集可能な提案書や業務書類を作成。内容を確認・修正してPDFに出力できます。',
        eyebrow: 'サービス事業者向け提案書作成ツール',
        h1: '代理店・フリーランス向けのAI提案書作成ツール',
        lead: 'AgencyOSは、プロジェクトのメモから編集可能な顧客向け提案書や業務書類を作成し、PDFとして出力できるブラウザーアプリです。',
        navLabel: '言語を選択', cta: '書類を作成する',
        howTitle: '顧客向け提案書の作成方法',
        steps: [
            ['プロジェクト概要を入力：', '顧客、目標、成果物、予算、スケジュールを入力するか、用途に合うテンプレートを選びます。'],
            ['下書きを生成して確認：', '書類の種類を選んで下書きを作成します。氏名、金額、日付、契約条件を確認し、必要な箇所を編集します。'],
            ['PDF出力または共有：', '書類をPDFでダウンロードできます。Proには共有可能な承認リンクと電子署名機能があります。']
        ],
        docsTitle: 'AgencyOSで作成できる書類',
        docsIntro: '顧客との業務に合わせて書類を選択できます。',
        docs: ['プロジェクト提案書と業務範囲の説明', 'プロジェクト概要と要件分析', '業務委託契約書と作業範囲記述書（SOW）', 'プロジェクトロードマップと導入資料', '検収記録と請求書'],
        audience: 'Webデザイン、SEO、EC、ブランディング、ソフトウェア開発などの一般的な案件に使えるテンプレートを用意しています。PDF出力前に文章を編集できます。',
        languageTitle: '複数の言語で書類を作成',
        languageText: '書類本文の言語は、ドイツ語、英語、インドネシア語、簡体字・繁体字中国語、日本語、フランス語、スペイン語から選べます。製品画面の言語は現在ドイツ語です。',
        faqTitle: 'AgencyOSについてよくある質問',
        faq: [
            ['登録前にAgencyOSを試せますか？', 'はい。ゲストモードではアカウント作成前に1件の書類を作成できます。'],
            ['AIが作成した下書きを編集できますか？', 'はい。出力や共有の前に、顧客情報、業務範囲、予算、日程を確認して編集できます。'],
            ['顧客はオンラインで承認・署名できますか？', '共有可能な承認リンクと電子署名機能はProで利用できます。'],
            ['AIが作成した契約書は法的助言ですか？', 'いいえ。下書きは出発点としてご利用ください。送信前に事実、価格、日付、契約条件をご確認ください。']
        ],
        legalLabel: '法的情報（ドイツ語）', privacyLabel: 'プライバシー（ドイツ語）', termsLabel: '利用規約（ドイツ語）'
    }
];

const localesWithHome = [locales[0], ...locales.slice(1)];
const hrefFor = (locale) => `${origin}/${locale.slug ? `${locale.slug}/` : ''}`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function renderPage(locale) {
    const canonical = hrefFor(locale);
    const alternates = localesWithHome.map((item) =>
        `    <link rel="alternate" hreflang="${escapeHtml(item.lang)}" href="${hrefFor(item)}">`
    ).join('\n');
    const nav = localesWithHome.map((item) => {
        const current = item.lang === locale.lang ? ' aria-current="page"' : '';
        return `                <a href="${hrefFor(item)}" lang="${escapeHtml(item.lang)}"${current}>${escapeHtml(item.label)}</a>`;
    }).join('\n');
    const steps = locale.steps.map(([label, text]) =>
        `                    <li><strong>${escapeHtml(label)}</strong> ${escapeHtml(text)}</li>`
    ).join('\n');
    const documents = locale.docs.map((item) => `                    <li>${escapeHtml(item)}</li>`).join('\n');
    const faq = locale.faq.map(([question, answer]) =>
        `                <details>\n                    <summary>${escapeHtml(question)}</summary>\n                    <p>${escapeHtml(answer)}</p>\n                </details>`
    ).join('\n');
    const structuredData = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'AgencyOS',
        url: canonical,
        description: locale.description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web browser',
        inLanguage: locale.lang,
        publisher: { '@type': 'Organization', name: 'Regler Productions', url: 'https://reglerproductions.com' }
    }, null, 2).replace(/</g, '\\u003c');
    const html = `<!doctype html>
<html lang="${escapeHtml(locale.lang)}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(locale.title)}</title>
    <meta name="description" content="${escapeHtml(locale.description)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <link rel="canonical" href="${canonical}">
${alternates}
    <link rel="alternate" hreflang="x-default" href="${hrefFor(locales[0])}">
    <link rel="stylesheet" href="/marketing.css">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="AgencyOS">
    <meta property="og:title" content="${escapeHtml(locale.title)}">
    <meta property="og:description" content="${escapeHtml(locale.description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:locale" content="${escapeHtml(locale.htmlLocale)}">
    <meta name="twitter:card" content="summary">
    <script type="application/ld+json">${structuredData}</script>
</head>
<body>
    <main class="marketing-discovery" aria-labelledby="productInfoTitle">
        <div class="marketing-wrap">
            <nav class="marketing-languages" aria-label="${escapeHtml(locale.navLabel)}">
${nav}
            </nav>
            <header class="marketing-hero">
                <p class="marketing-eyebrow">${escapeHtml(locale.eyebrow)}</p>
                <h1 id="productInfoTitle">${escapeHtml(locale.h1)}</h1>
                <p class="marketing-lead">${escapeHtml(locale.lead)}</p>
                <a class="marketing-cta" href="/#appWorkspace">${escapeHtml(locale.cta)}</a>
            </header>
            <section aria-labelledby="howItWorksTitle">
                <h2 id="howItWorksTitle">${escapeHtml(locale.howTitle)}</h2>
                <ol class="marketing-steps">
${steps}
                </ol>
            </section>
            <section aria-labelledby="documentTypesTitle">
                <h2 id="documentTypesTitle">${escapeHtml(locale.docsTitle)}</h2>
                <p>${escapeHtml(locale.docsIntro)}</p>
                <ul class="marketing-list">
${documents}
                </ul>
                <p>${escapeHtml(locale.audience)}</p>
            </section>
            <section aria-labelledby="languagesTitle">
                <h2 id="languagesTitle">${escapeHtml(locale.languageTitle)}</h2>
                <p>${escapeHtml(locale.languageText)}</p>
            </section>
            <section class="marketing-faq" aria-labelledby="faqTitle">
                <h2 id="faqTitle">${escapeHtml(locale.faqTitle)}</h2>
${faq}
            </section>
            <footer class="marketing-footer">
                <span>AgencyOS · Regler Productions</span>
                <span><a href="/impressum.html">${escapeHtml(locale.legalLabel)}</a> · <a href="/datenschutz.html">${escapeHtml(locale.privacyLabel)}</a> · <a href="/agb.html">${escapeHtml(locale.termsLabel)}</a></span>
            </footer>
        </div>
    </main>
</body>
</html>
`;
    return html;
}

async function main() {
    for (const locale of locales.slice(1)) {
        const directory = path.join(publicDir, locale.slug);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'index.html'), renderPage(locale), 'utf8');
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
