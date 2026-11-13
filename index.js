const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const app = express();
app.use(express.urlencoded({ extended: true }));
const PORT = process.env.PORT || 3000;

let ostatniQR = '';
let botGotowy = false;
let bladBota = '';

const PLIK_USTAWIEN = 'ustawienia.json';
let config = {
    ochronaAktywna: true,
    trybNocnyAktywny: true,
    godzinaZamkniecia: 20,
    godzinaOtwarcia: 7,
    blokujHasztagi: true,
    tylkoUsuwajPrzeklenstwa: false,
    wybranaGrupa: '',
    zakazaneSlowa: ['kurwa', 'kurw', 'chuj', 'pierdol', 'jebać', 'jebac', 'skurwysyn', 'cipa', 'pizda', 'spierdalaj']
};

if (fs.existsSync(PLIK_USTAWIEN)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(PLIK_USTAWIEN, 'utf8')) };
    } catch (e) {}
}

function zapiszUstawienia() {
    fs.writeFileSync(PLIK_USTAWIEN, JSON.stringify(config, null, 2), 'utf8');
}

function czyTrwaCiszaNocna() {
    if (!config.trybNocnyAktywny) return false;
    const godz = new Date().getHours();
    return config.godzinaZamkniecia < config.godzinaOtwarcia
        ? (godz >= config.godzinaZamkniecia && godz < config.godzinaOtwarcia)
        : (godz >= config.godzinaZamkniecia || godz < config.godzinaOtwarcia);
}

function czyZawieraPrzeklenstwo(tekst) {
    if (!tekst) return false;
    const maly = tekst.toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/@/g, 'a').replace(/\$/g, 's').replace(/#/g, 'a');
    const bezZnakow = maly.replace(/[^a-ząćęłńóśźż]/g, '');
    return config.zakazaneSlowa.some(s => maly.includes(s) || (s.length >= 3 && bezZnakow.includes(s)));
}

app.get('/', async (req, res) => {
    if (bladBota) {
        return res.send(`
            <html><head><meta charset="utf-8"></head>
            <body style="background:#0f172a;color:#f87171;font-family:sans-serif;text-align:center;padding:40px;">
                <h2>Błąd: ${bladBota}</h2>
                <br><a href="/restart" style="padding:12px 24px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;">Spróbuj ponownie</a>
            </body></html>
        `);
    }

    if (!botGotowy && ostatniQR) {
        const qrImage = await QRCode.toDataURL(ostatniQR);
        return res.send(`
            <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Logowanie Bota WhatsApp</title></head>
            <body style="background:#0f172a;color:#fff;font-family:sans-serif;text-align:center;padding:30px;">
                <h2>📱 Połącz bota z WhatsAppem</h2>
                <p>Otwórz WhatsApp &rarr; Połączone urządzenia &rarr; Połącz urządzenie</p>
                <img src="${qrImage}" style="border:12px solid #fff;border-radius:16px;width:260px;height:260px;margin:20px 0;" />
                <br><button onclick="location.reload()" style="padding:12px 24px;font-size:16px;border-radius:8px;border:none;background:#22c55e;color:#fff;cursor:pointer;">Odśwież stronę</button>
            </body></html>
        `);
    }

    if (!botGotowy) {
        return res.send(`
            <html><head><meta charset="utf-8"><meta http-equiv="refresh" content="6"></head>
            <body style="background:#0f172a;color:#38bdf8;font-family:sans-serif;text-align:center;padding-top:80px;">
                <h2>⏳ Ładowanie i synchronizacja WhatsApp... Strona odświeży się sama za 6 sekund.</h2>
            </body></html>
        `);
    }

    res.send(`
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Panel Sterowania Botem</title>
        <style>
            body { background:#0f172a; color:#f8fafc; font-family:sans-serif; max-width:600px; margin:0 auto; padding:20px; }
            .card { background:#1e293b; padding:18px; border-radius:12px; margin-bottom:16px; }
            h1 { color:#22c55e; font-size:22px; text-align:center; }
            .btn { display:inline-block; padding:10px 16px; border-radius:8px; text-decoration:none; color:#fff; font-weight:bold; margin:4px 2px; border:none; cursor:pointer; font-size:14px; }
            .on { background:#16a34a; } .off { background:#dc2626; } .blue { background:#2563eb; }
            input { padding:10px; border-radius:8px; border:1px solid #475569; background:#0f172a; color:#fff; width:65%; }
            .tag { display:inline-block; background:#334155; padding:5px 10px; border-radius:6px; margin:3px; font-size:13px; }
        </style></head><body>
            <h1>🤖 PANEL STEROWANIA BOTEM WHATSAPP</h1>

            <div class="card">
                <h3>🛡️ Główna ochrona: ${config.ochronaAktywna ? '<span style="color:#4ade80">WŁĄCZONA</span>' : '<span style="color:#f87171">WYŁĄCZONA</span>'}</h3>
                <a href="/toggle/ochrona" class="btn ${config.ochronaAktywna ? 'off' : 'on'}">${config.ochronaAktywna ? 'Wyłącz bota' : 'Włącz bota'}</a>
            </div>

            <div class="card">
                <h3>🌙 Cisza nocna (${config.godzinaZamkniecia}:00 – ${config.godzinaOtwarcia}:00): ${config.trybNocnyAktywny ? '<span style="color:#4ade80">ON</span>' : '<span style="color:#f87171">OFF</span>'}</h3>
                <a href="/toggle/noc" class="btn ${config.trybNocnyAktywny ? 'off' : 'on'}">${config.trybNocnyAktywny ? 'Wyłącz ciszę nocną' : 'Włącz ciszę nocną'}</a>
            </div>

            <div class="card">
                <h3>#️⃣ Blokada hasztagów (#): ${config.blokujHasztagi ? '<span style="color:#4ade80">ON</span>' : '<span style="color:#f87171">OFF</span>'}</h3>
                <a href="/toggle/hasztagi" class="btn ${config.blokujHasztagi ? 'off' : 'on'}">${config.blokujHasztagi ? 'Wyłącz blokadę #' : 'Włącz blokadę #'}</a>
            </div>

            <div class="card">
                <h3>⚖️ Kara za przekleństwa: ${config.tylkoUsuwajPrzeklenstwa ? 'Tylko usuwanie' : 'Wyrzucenie z grupy (KICK)'}</h3>
                <a href="/toggle/kara" class="btn blue">Zmień karę na: ${config.tylkoUsuwajPrzeklenstwa ? 'KICK' : 'Tylko usuwanie'}</a>
            </div>

            <div class="card">
                <h3>🎯 Wybrana grupa (zostaw puste dla wszystkich)</h3>
                <form method="POST" action="/grupa">
                    <input type="text" name="nazwa" value="${config.wybranaGrupa}" placeholder="np. Grupa klasowa 4B" />
                    <button type="submit" class="btn blue">Zapisz</button>
                </form>
            </div>

            <div class="card">
                <h3>🤬 Zakazane słowa (${config.zakazaneSlowa.length})</h3>
                <form method="POST" action="/dodaj-slowo" style="margin-bottom:12px;">
                    <input type="text" name="slowo" placeholder="Wpisz nowe słowo..." required />
                    <button type="submit" class="btn on">Dodaj</button>
                </form>
                <div>
                    ${config.zakazaneSlowa.map(s => `<span class="tag">${s} <a href="/usun-slowo?s=${encodeURIComponent(s)}" style="color:#f87171;text-decoration:none;margin-left:5px;">✖</a></span>`).join('')}
                </div>
            </div>
        </body></html>
    `);
});

app.get('/restart', (req, res) => {
    bladBota = '';
    ostatniQR = '';
    client.initialize().catch(err => { bladBota = err.message; });
    res.redirect('/');
});

app.get('/toggle/:co', (req, res) => {
    const co = req.params.co;
    if (co === 'ochrona') config.ochronaAktywna = !config.ochronaAktywna;
    if (co === 'noc') config.trybNocnyAktywny = !config.trybNocnyAktywny;
    if (co === 'hasztagi') config.blokujHasztagi = !config.blokujHasztagi;
    if (co === 'kara') config.tylkoUsuwajPrzeklenstwa = !config.tylkoUsuwajPrzeklenstwa;
    zapiszUstawienia();
    res.redirect('/');
});

app.post('/grupa', (req, res) => {
    config.wybranaGrupa = (req.body.nazwa || '').trim().toLowerCase();
    zapiszUstawienia();
    res.redirect('/');
});

app.post('/dodaj-slowo', (req, res) => {
    const s = (req.body.slowo || '').trim().toLowerCase();
    if (s && !config.zakazaneSlowa.includes(s)) {
        config.zakazaneSlowa.push(s);
        zapiszUstawienia();
    }
    res.redirect('/');
});

app.get('/usun-slowo', (req, res) => {
    const s = (req.query.s || '').toLowerCase();
    config.zakazaneSlowa = config.zakazaneSlowa.filter(x => x !== s);
    zapiszUstawienia();
    res.redirect('/');
});

app.listen(PORT, () => console.log(`Panel bota działa na porcie ${PORT}`));

const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 0,
    qrMaxRetries: 10,
    puppeteer: {
        headless: true,
        timeout: 0,
        protocolTimeout: 0,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--no-first-run'
        ]
    }
});

client.on('qr', (qr) => {
    ostatniQR = qr;
    botGotowy = false;
    console.log('QR wygenerowany!');
});

client.on('authenticated', () => {
    ostatniQR = '';
    console.log('Zeskanowano kod QR, trwa ładowanie czatów...');
});

client.on('ready', () => {
    botGotowy = true;
    ostatniQR = '';
    console.log('Bot WhatsApp połączony i gotowy!');
});

client.on('message_create', async (msg) => {
    const chat = await msg.getChat();
    const tresc = (msg.body || '').trim();

    if (chat.isGroup && !msg.fromMe && config.ochronaAktywna) {
        const nazwaGrupy = chat.name.trim().toLowerCase();
        if (config.wybranaGrupa && nazwaGrupy !== config.wybranaGrupa) return;

        const autor = msg.author || msg.from;
        const uczestnik = chat.participants.find(p => p.id._serialized === autor);
        if (uczestnik && (uczestnik.isAdmin || uczestnik.isSuperAdmin)) return;

        if (czyTrwaCiszaNocna()) {
            try { await msg.delete(true); } catch (e) {}
            return;
        }

        if (config.blokujHasztagi && tresc.includes('#')) {
            try {
                await msg.delete(true);
                await chat.sendMessage('🚫 Usunięto wiadomość za użycie hasztagu (#).');
            } catch (e) {}
            return;
        }

        if (czyZawieraPrzeklenstwo(tresc)) {
            try {
                await msg.delete(true);
                if (config.tylkoUsuwajPrzeklenstwa) {
                    await chat.sendMessage('🤬 Usunięto wiadomość za przeklinanie.');
                } else {
                    await chat.removeParticipants([autor]);
                    await chat.sendMessage('🔨 Użytkownik został usunięty za przeklinanie.');
                }
            } catch (e) {}
        }
    }
});

client.initialize().catch(err => {
    bladBota = err.message;
    console.error('Błąd startu:', err);
});
