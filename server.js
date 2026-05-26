const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const crypto = require('crypto');
const path = require('path');

const PORT = 3000;
const activeUsers = new Map(); // Numara/Nick Hash -> Socket ID

function hashNumber(number) {
    return crypto.createHash('sha256').update(number).digest('hex');
}

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    
    // ANLIK BENZERSİZLİK KONTROLÜ (Çakışma Engelleme Motoru)
    socket.on('check-nickname-availability', (nick, callback) => {
        const hashed = hashNumber(nick);
        if (activeUsers.has(hashed)) {
            callback({ available: false }); // İsim havuzda var, çakışma koruması devrede
        } else {
            callback({ available: true }); // İsim temiz, kullanılabilir
        }
    });
    
    socket.on('register-ghost', (num) => {
        const hashed = hashNumber(num);
        activeUsers.set(hashed, socket.id);
        socket.hashedNumber = hashed;
    });

    socket.on('initiate-ghost-call', (data) => {
        const receiverHash = hashNumber(data.receiver);

        if (activeUsers.has(receiverHash)) {
            const receiverSocketId = activeUsers.get(receiverHash);
            
            socket.peerSocketId = receiverSocketId;
            const peerSocket = io.sockets.sockets.get(receiverSocketId);
            if (peerSocket) peerSocket.peerSocketId = socket.id;

            io.to(receiverSocketId).emit('ghost-incoming', { from: data.sender });
            socket.emit('ghost-tunnel-ready');
        } else {
            socket.emit('ghost-status', 'Target offline. Notification bridge engaged.');
        }
    });

    socket.on('send-ghost-msg', (data) => {
        if (socket.peerSocketId) {
            socket.to(socket.peerSocketId).emit('receive-ghost-msg', data);
        }
    });

    socket.on('msg-read-confirm', (data) => {
        if (socket.peerSocketId) {
            socket.to(socket.peerSocketId).emit('start-msg-destruction', data);
        }
    });

    socket.on('ghost-offer', (offer) => {
        if (socket.peerSocketId) socket.to(socket.peerSocketId).emit('ghost-offer', offer);
    });

    socket.on('ghost-answer', (answer) => {
        if (socket.peerSocketId) socket.to(socket.peerSocketId).emit('ghost-answer', answer);
    });

    socket.on('ghost-ice', (candidate) => {
        if (socket.peerSocketId) socket.to(socket.peerSocketId).emit('ghost-ice', candidate);
    });

    socket.on('disconnect', () => {
        if (socket.hashedNumber) activeUsers.delete(socket.hashedNumber);
        if (socket.peerSocketId) {
            io.to(socket.peerSocketId).emit('ghost-status', 'Tunnel collapsed.');
            const peer = io.sockets.sockets.get(socket.peerSocketId);
            if (peer) peer.peerSocketId = null;
        }
    });
});

http.listen(PORT, () => {
    console.log(`Active on port ${PORT}`);
});
