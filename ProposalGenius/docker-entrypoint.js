const { spawn } = require('child_process');

const generator = spawn(process.execPath, ['tools/build-runtime-config.js'], {
    stdio: 'inherit',
    env: process.env
});

generator.on('error', (error) => {
    console.error('Firebase-Runtime-Konfiguration konnte nicht erzeugt werden:', error.message);
    process.exit(1);
});

generator.on('exit', (code, signal) => {
    if (signal || code !== 0) {
        process.exit(code || 1);
    }

    const app = spawn(process.execPath, ['server.js'], {
        stdio: 'inherit',
        env: process.env
    });

    app.on('error', (error) => {
        console.error('AgencyOS konnte nicht gestartet werden:', error.message);
        process.exit(1);
    });

    const stop = (signalName) => app.kill(signalName);
    process.on('SIGTERM', () => stop('SIGTERM'));
    process.on('SIGINT', () => stop('SIGINT'));

    app.on('exit', (appCode, appSignal) => {
        process.exit(appCode || (appSignal ? 1 : 0));
    });
});
