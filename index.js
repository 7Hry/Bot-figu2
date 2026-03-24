const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const sharp = require('sharp');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const http = require('http');

// Servidor fake obrigatório pro Render
http.createServer((req, res) => res.end('Bot rodando')).listen(process.env.PORT || 10000);

async function conectar() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Bot Figurinhas Dedão', 'Chrome', '1.0'],
        connectTimeoutMs: 120000,      // 2 minutos
        defaultQueryTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n🔥 QR CODE GERADO:');
            qrcode.generate(qr, { small: true });
            console.log('\nEscaneie AGORA com o WhatsApp Business!');
        }

        if (connection === 'open') {
            console.log('\n✅ BOT CONECTADO COM SUCESSO - MODO DEFORMAÇÃO TOTAL ATIVADO!');
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode || 'desconhecido';
            console.log(`Conexão fechada (código ${code}). Reconectando em 10 segundos...`);
            setTimeout(conectar, 10000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();

        const hasMedia = msg.message.imageMessage || msg.message.videoMessage ||
                        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
                        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

        if (!hasMedia && texto !== '/s' && texto !== '/s2') return;

        const isAchatado = texto === '/s' || texto.startsWith('/s ');

        console.log(`📸 Criando sticker - ${isAchatado ? 'ACHATADO' : 'NORMAL'}`);

        try {
            const buffer = await sock.downloadMediaMessage(msg);

            let finalBuffer = buffer;

            if (isAchatado) {
                finalBuffer = await sharp(buffer).resize(512, 512, { fit: 'fill' }).webp({ quality: 70 }).toBuffer();
            } else {
                finalBuffer = await sharp(buffer).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
            }

            const sticker = new Sticker(finalBuffer, {
                pack: 'Bot do',
                author: 'Dedão',
                type: StickerTypes.FULL,
                quality: 75,
            });

            const stickerBuffer = await sticker.toBuffer();

            await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });

        } catch (err) {
            console.error(err);
            await sock.sendMessage(from, { text: '❌ Erro ao criar sticker.' });
        }
    });
}

conectar();
