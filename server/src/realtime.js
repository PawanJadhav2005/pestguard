// Socket.IO: pushes live updates to signed-in apps.
// Rooms: role:admin, role:callcenter, role:technician, user:<id>
let io = null;
function init(server, corsOrigins) {
  const { Server } = require('socket.io');
  const { userFromToken } = require('./auth');
  io = new Server(server, { cors: { origin: corsOrigins } });
  io.use(async (socket, next) => {
    try { socket.user = await userFromToken(socket.handshake.auth?.token); next(); }
    catch { next(new Error('unauthorized')); }
  });
  io.on('connection', s => { s.join(`role:${s.user.role}`); s.join(`user:${s.user.id}`); });
  return io;
}
function emit(rooms, event, payload = {}) {
  if (!io) return;
  [].concat(rooms).forEach(r => io.to(r).emit(event, payload));
}
module.exports = { init, emit };
