const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const net = require('net');
const path = require('path');
const AntigravityScheduler = require('./scheduler');

const app = express();
app.use(cors());
app.use(express.json());

// Serve Static Dashboard in Production (Paths updated for backend/server structure)
const DIST_PATH = path.join(__dirname, '../../../frontend/dist');
app.use(express.static(DIST_PATH));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const scheduler = new AntigravityScheduler();

// TCP SERVER for Workers
const TCP_PORT = 4000;
const tcpServer = net.createServer((socket) => {
  const workerId = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[Worker Connected] ${workerId}`);
  
  socket.on('data', (data) => {
    try {
      const messages = data.toString().split('\n').filter(m => m.trim() !== '');
      messages.forEach(msg => {
        const payload = JSON.parse(msg);
        
        if (payload.type === 'REGISTER') {
          scheduler.registerNode(workerId, socket, payload.metrics);
        } else if (payload.type === 'HEARTBEAT') {
          scheduler.updateNodeMetrics(workerId, payload.metrics);
        } else if (payload.type === 'TASK_COMPLETED') {
          scheduler.resolveTask(payload.taskId, payload.result);
        } else if (payload.type === 'TASK_FAILED') {
          scheduler.failTask(payload.taskId, payload.error);
        }
      });
    } catch (e) {
      console.error('Error parsing TCP message from worker', e);
    }
  });

  socket.on('close', () => {
    console.log(`[Worker Disconnected] ${workerId}`);
    scheduler.removeNode(workerId);
  });
  
  socket.on('error', (err) => {
    console.error(`Socket error from ${workerId}:`, err.message);
  });
});

tcpServer.listen(TCP_PORT, () => {
  console.log(`TCP Coordinator Server running on port ${TCP_PORT}`);
});

// WEBSOCKET INTERFACE for Dashboard
io.on('connection', (socket) => {
  console.log('Dashboard connected');
  
  // Send initial state
  socket.emit('system_state', scheduler.getSystemState());
  
  socket.on('spawn_workers', ({ count }) => {
    scheduler.spawnSimulatedWorkers(count);
  });

  socket.on('kill_worker', ({ workerId }) => {
    scheduler.killSimulatedWorker(workerId);
  });

  socket.on('submit_task', (taskDescriptor) => {
    scheduler.enqueueTask(taskDescriptor);
  });

  socket.on('toggle_chaos', (enabled) => {
    scheduler.setChaosMode(enabled);
  });
});

// Broadcast system state to dashboard occasionally
setInterval(() => {
  io.emit('system_state', scheduler.getSystemState());
}, 1000);

// API SERVER for UI & CLI
const HTTP_PORT = 3000;
app.get('/api/state', (req, res) => {
  res.json(scheduler.getSystemState());
});

app.post('/api/tasks', (req, res) => {
  const { type, priority, count, timeout } = req.body;
  const numTasks = count || 1;
  const ids = [];

  for (let i = 0; i < numTasks; i++) {
    scheduler.enqueueTask({
      type: type || 'CPU_INTENSIVE',
      priority: priority || 'NORMAL',
      timeout: timeout || 10000,
      duration: 3000 // default duration
    });
  }
  res.status(202).json({ success: true, count: numTasks });
});

// SPA Fallback Middleware (Express 5 compatible)
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html') && !req.url.startsWith('/api')) {
    res.sendFile(path.join(DIST_PATH, 'index.html'));
  } else {
    next();
  }
});

server.listen(HTTP_PORT, () => {
  console.log(`HTTP Production Stack running on port ${HTTP_PORT}`);
  console.log(`Serving dashboard from ${DIST_PATH}`);
});
