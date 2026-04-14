const net = require('net');
const os = require('os-utils');
const Executor = require('./executor');

const SERVER_HOST = process.env.SERVER_HOST || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.SERVER_PORT) || 4000;

class WorkerClient {
  constructor() {
    this.client = new net.Socket();
    this.executor = new Executor(this);
    this.runningTasks = 0;
  }

  start() {
    this.client.connect(SERVER_PORT, SERVER_HOST, () => {
      console.log(`Connected to Coordinator Server at ${SERVER_HOST}:${SERVER_PORT}`);
      this.sendRegistration();
      
      setInterval(() => {
        this.sendHeartbeat();
      }, 2000);
    });

    this.client.on('data', (data) => {
      const messages = data.toString().split('\n').filter(m => m.trim() !== '');
      messages.forEach(msg => {
        try {
          const payload = JSON.parse(msg);
          if (payload.type === 'EXECUTE') {
            this.handleTask(payload.task);
          }
        } catch (e) {
          console.error('Error parsing directive from server', e);
        }
      });
    });

    this.client.on('close', () => {
      console.log('Connection to server closed, shutting down or retrying...');
      process.exit(1);
    });

    this.client.on('error', (err) => {
      console.error('Connection error', err.message);
    });
  }

  getMetrics(callback) {
    os.cpuUsage((v) => {
      const metrics = {
        cpu: v, // 0 to 1
        ram: 1 - os.freememPercentage(), // 0 to 1 used
        runningTasks: this.runningTasks
      };
      callback(metrics);
    });
  }

  sendRegistration() {
    this.getMetrics((metrics) => {
      this.sendMsg({
        type: 'REGISTER',
        metrics
      });
    });
  }

  sendHeartbeat() {
    this.getMetrics((metrics) => {
      this.sendMsg({
        type: 'HEARTBEAT',
        metrics
      });
    });
  }

  handleTask(task) {
    console.log(`[Task Received] ${task.id} (${task.type})`);
    this.runningTasks++;
    
    this.executor.runTask(task)
      .then((result) => {
        this.runningTasks--;
        this.sendMsg({
          type: 'TASK_COMPLETED',
          taskId: task.id,
          result
        });
        console.log(`[Task Completed] ${task.id}`);
      })
      .catch((error) => {
        this.runningTasks--;
        this.sendMsg({
          type: 'TASK_FAILED',
          taskId: task.id,
          error: error.message || error
        });
        console.error(`[Task Failed] ${task.id}`, error);
      });
  }

  sendMsg(obj) {
    if (!this.client.destroyed) {
      this.client.write(JSON.stringify(obj) + '\n');
    }
  }
}

const worker = new WorkerClient();
worker.start();
