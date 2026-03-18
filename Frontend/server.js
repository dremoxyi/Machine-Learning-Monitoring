/**
 * Express Server pour le Frontend
 * Sert les fichiers statiques et proxy vers le backend
 */
const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';

// Logging des requêtes
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Proxy API vers le backend
app.use('/api', createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/api': ''
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(502).json({ 
            error: 'Backend non disponible',
            message: err.message 
        });
    }
}));

// Proxy WebSocket
app.use('/ws', createProxyMiddleware({
    target: BACKEND_URL.replace('http', 'ws'),
    ws: true,
    changeOrigin: true
}));

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Route de santé
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'frontend',
        timestamp: new Date().toISOString() 
    });
});

// SPA fallback - toutes les routes non matchées retournent index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ 
        error: 'Erreur interne du serveur',
        message: err.message 
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Frontend server running on port ${PORT}`);
    console.log(`Backend URL: ${BACKEND_URL}`);
});
