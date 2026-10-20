const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Mock API Config for frontend
app.get('/api/config', (req, res) => {
    res.json({
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock',
        geminiAvailable: true,
        supportedLanguages: ['de', 'en', 'fr', 'es']
    });
});

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 =======================================================`);
    console.log(`   AgencyOS Local Server running!`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log(`   Public folder: ${path.join(__dirname, 'public')}`);
    console.log(`==========================================================\n`);
});
